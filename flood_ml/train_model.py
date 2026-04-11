from __future__ import annotations

import argparse
import csv
import io
import json
import re
import statistics
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

import joblib
import requests
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score

HYDRO_LIVE_URL = "http://danepubliczne.imgw.pl/api/data/hydro/"
HYDRO_DAILY_BASE = "http://danepubliczne.imgw.pl/data/dane_pomiarowo_obserwacyjne/dane_hydrologiczne/dobowe"
WARN_ARCHIVE_BASE = "http://danepubliczne.imgw.pl/data/arch/ost_hydro"

FLOOD_WARNING_KEYWORDS = (
    "wezbr",
    "powodz",
    "powódź",
    "wzrosty stan",
    "stanow ostrzegawcz",
    "stanów ostrzegawcz",
    "stanow alarmow",
    "stanów alarmow",
)
FLOOD_WARNING_EXCLUDE = ("susza",)


@dataclass
class DayFeatures:
    d: date
    station_count: int
    mean_level: float
    max_level: float
    p90_level: float
    mean_flow: float
    max_flow: float


def _safe_float(value: str) -> Optional[float]:
    text = str(value).strip()
    if not text or text.upper() == "NULL":
        return None
    try:
        return float(text.replace(",", "."))
    except ValueError:
        return None


def _percentile(values: List[float], q: float) -> float:
    if not values:
        return 0.0
    vals = sorted(values)
    pos = (len(vals) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(vals) - 1)
    if lo == hi:
        return vals[lo]
    frac = pos - lo
    return vals[lo] * (1 - frac) + vals[hi] * frac


def get_lubelskie_station_ids(session: requests.Session) -> Set[str]:
    rows = session.get(HYDRO_LIVE_URL, timeout=30).json()
    return {
        str(r.get("id_stacji", "")).strip()
        for r in rows
        if str(r.get("wojewodztwo", "")).strip().lower() == "lubelskie"
    }


def _download_zip(session: requests.Session, url: str) -> Optional[zipfile.ZipFile]:
    response = session.get(url, timeout=60)
    if response.status_code != 200:
        return None
    content_type = str(response.headers.get("content-type", "")).lower()
    if "text/html" in content_type:
        return None
    try:
        return zipfile.ZipFile(io.BytesIO(response.content))
    except zipfile.BadZipFile:
        return None


def iter_daily_rows(
    session: requests.Session,
    station_ids: Set[str],
    years: Iterable[int],
) -> Iterable[Tuple[date, float, Optional[float]]]:
    for year in years:
        for month in range(1, 13):
            url = f"{HYDRO_DAILY_BASE}/{year}/codz_{year}_{month:02d}.zip"
            archive = _download_zip(session, url)
            if archive is None:
                continue
            for member in archive.namelist():
                if not member.lower().endswith(".csv"):
                    continue
                raw = archive.read(member)
                text = raw.decode("cp1250", errors="ignore")
                reader = csv.reader(io.StringIO(text))
                for row in reader:
                    if len(row) < 10:
                        continue
                    station_id = row[0].strip().strip('"').strip()
                    if station_id not in station_ids:
                        continue

                    year_str = row[3].strip().strip('"')
                    day_str = row[5].strip().strip('"')
                    month_cal_str = row[9].strip().strip('"')

                    water_level = _safe_float(row[6])
                    if water_level is None or water_level >= 9999:
                        continue
                    flow = _safe_float(row[7])
                    if flow is not None and flow >= 99999:
                        flow = None

                    try:
                        d = date(int(year_str), int(month_cal_str), int(day_str))
                    except ValueError:
                        continue

                    yield d, float(water_level), flow


def build_daily_features(rows: Iterable[Tuple[date, float, Optional[float]]]) -> List[DayFeatures]:
    levels_by_day: Dict[date, List[float]] = defaultdict(list)
    flows_by_day: Dict[date, List[float]] = defaultdict(list)

    for d, level, flow in rows:
        levels_by_day[d].append(level)
        if flow is not None:
            flows_by_day[d].append(flow)

    features: List[DayFeatures] = []
    for d in sorted(levels_by_day.keys()):
        levels = levels_by_day[d]
        flows = flows_by_day.get(d, [])
        features.append(
            DayFeatures(
                d=d,
                station_count=len(levels),
                mean_level=statistics.fmean(levels),
                max_level=max(levels),
                p90_level=_percentile(levels, 0.9),
                mean_flow=statistics.fmean(flows) if flows else 0.0,
                max_flow=max(flows) if flows else 0.0,
            )
        )
    return features


def _extract_warning_issue_date(text: str) -> Optional[date]:
    match = re.search(r"data i godzina wydania:\s*(\d{2}\.\d{2}\.\d{4})", text)
    if not match:
        return None
    day, month, year = match.group(1).split(".")
    try:
        return date(int(year), int(month), int(day))
    except ValueError:
        return None


def _is_flood_warning(text: str) -> bool:
    if any(ex in text for ex in FLOOD_WARNING_EXCLUDE):
        return False

    phenomenon = ""
    match = re.search(r"zjawisko:\s*(.+)", text)
    if match:
        phenomenon = match.group(1).strip()

    haystacks = [phenomenon, text]
    for hay in haystacks:
        if any(kw in hay for kw in FLOOD_WARNING_KEYWORDS):
            return True

    return False


def iter_warning_days(session: requests.Session, years: Iterable[int]) -> Set[date]:
    warning_days: Set[date] = set()

    for year in years:
        for month in range(1, 13):
            url = f"{WARN_ARCHIVE_BASE}/{year}/{month:02d}.zip"
            archive = _download_zip(session, url)
            if archive is None:
                continue

            for member in archive.namelist():
                if not member.lower().endswith(".txt"):
                    continue
                text = archive.read(member).decode("cp1250", errors="ignore").lower()
                if "lubelskie" not in text:
                    continue
                if not _is_flood_warning(text):
                    continue
                issue_date = _extract_warning_issue_date(text)
                if issue_date is not None:
                    warning_days.add(issue_date)

    return warning_days


def build_training_matrix(features: List[DayFeatures], warning_days: Set[date]) -> Tuple[List[List[float]], List[int], List[date]]:
    x: List[List[float]] = []
    y: List[int] = []
    days: List[date] = []

    for idx in range(2, len(features)):
        cur = features[idx]
        prev = features[idx - 1]
        prev2 = features[idx - 2]

        vector = [
            cur.station_count,
            cur.mean_level,
            cur.max_level,
            cur.p90_level,
            cur.mean_flow,
            cur.max_flow,
            cur.mean_level - prev.mean_level,
            cur.max_level - prev.max_level,
            cur.mean_level - prev2.mean_level,
            prev.mean_level,
            prev.max_level,
        ]
        x.append(vector)
        y.append(1 if cur.d in warning_days else 0)
        days.append(cur.d)

    return x, y, days


def main() -> None:
    parser = argparse.ArgumentParser(description="Train flood-risk classifier for Lubelskie from IMGW historical data")
    parser.add_argument("--start-year", type=int, default=2010)
    parser.add_argument("--end-year", type=int, default=2024)
    parser.add_argument("--artifacts-dir", default="flood_ml/artifacts")
    args = parser.parse_args()

    years = list(range(args.start_year, args.end_year + 1))

    with requests.Session() as session:
        station_ids = get_lubelskie_station_ids(session)
        daily_rows = list(iter_daily_rows(session, station_ids, years))
        features = build_daily_features(daily_rows)
        warning_days = iter_warning_days(session, years)

    x, y, days = build_training_matrix(features, warning_days)
    if len(x) < 200:
        raise RuntimeError(f"Too few training rows: {len(x)}")
    positives = sum(y)
    if positives < 10:
        raise RuntimeError(f"Too few positive samples: {positives}")

    split_idx = int(len(x) * 0.8)
    x_train, y_train = x[:split_idx], y[:split_idx]
    x_test, y_test = x[split_idx:], y[split_idx:]

    model = RandomForestClassifier(
        n_estimators=500,
        max_depth=10,
        min_samples_leaf=3,
        random_state=42,
        class_weight="balanced_subsample",
        n_jobs=-1,
    )
    model.fit(x_train, y_train)

    y_pred = model.predict(x_test)
    y_proba = model.predict_proba(x_test)[:, 1]

    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    auc = roc_auc_score(y_test, y_proba) if len(set(y_test)) > 1 else 0.0

    artifacts_dir = Path(args.artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    feature_names = [
        "station_count",
        "mean_level",
        "max_level",
        "p90_level",
        "mean_flow",
        "max_flow",
        "delta_mean_level_1d",
        "delta_max_level_1d",
        "delta_mean_level_2d",
        "prev_mean_level",
        "prev_max_level",
    ]

    model_path = artifacts_dir / "flood_risk_model.joblib"
    meta_path = artifacts_dir / "flood_risk_model_meta.json"

    joblib.dump(model, model_path)
    meta_path.write_text(
        json.dumps(
            {
                "start_year": args.start_year,
                "end_year": args.end_year,
                "train_rows": len(x_train),
                "test_rows": len(x_test),
                "positive_rows": positives,
                "auc": auc,
                "classification_report": report,
                "feature_names": feature_names,
                "last_training_day": str(days[-1]),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Model saved: {model_path}")
    print(f"Metadata saved: {meta_path}")
    print(f"Train rows: {len(x_train)}, Test rows: {len(x_test)}, Positives: {positives}, AUC: {auc:.4f}")


if __name__ == "__main__":
    main()
