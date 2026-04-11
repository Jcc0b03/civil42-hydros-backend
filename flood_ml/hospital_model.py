from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import statistics
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

import joblib
import requests
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import classification_report, roc_auc_score

from szpitale_api.database import ensure_database
from szpitale_api.repository import Repository

HYDRO_LIVE_URL = "http://danepubliczne.imgw.pl/api/data/hydro/"
HYDRO_DAILY_BASE = "http://danepubliczne.imgw.pl/data/dane_pomiarowo_obserwacyjne/dane_hydrologiczne/dobowe"
WARN_ARCHIVE_BASE = "http://danepubliczne.imgw.pl/data/arch/ost_hydro"

FEATURE_NAMES = [
    "station_count",
    "mean_level",
    "max_level",
    "p90_level",
    "mean_flow",
    "max_flow",
    "delta_mean_level_1d",
    "delta_max_level_1d",
    "hospital_latitude",
    "hospital_longitude",
    "hospital_total_beds",
    "hospital_free_beds",
    "nearest_station_distance_km",
    "nearest_station_level_cm",
    "nearest_station_flow_m3s",
]

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


@dataclass(frozen=True)
class StationMeta:
    station_id: str
    station_name: str
    river: str
    voivodeship: str
    latitude: float
    longitude: float


@dataclass
class DaySnapshot:
    day: date
    station_count: int
    mean_level: float
    max_level: float
    p90_level: float
    mean_flow: float
    max_flow: float
    levels_by_station: Dict[str, float]
    flows_by_station: Dict[str, float]


@dataclass
class HospitalContext:
    hospital_name: str
    address: str
    latitude: float
    longitude: float
    total_beds: int
    free_beds: int
    hospital_id: Optional[int] = None


def _safe_float(value: Any) -> Optional[float]:
    text = str(value).strip()
    if not text or text.upper() == "NULL":
        return None
    try:
        return float(text.replace(",", "."))
    except ValueError:
        return None


def _safe_int(value: Any) -> Optional[int]:
    text = str(value).strip()
    if not text or text.upper() == "NULL":
        return None
    try:
        return int(float(text.replace(",", ".")))
    except ValueError:
        return None


def _percentile(values: Sequence[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return float(ordered[lower])
    weight = position - lower
    return float(ordered[lower] * (1 - weight) + ordered[upper] * weight)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


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


def _get_lubelskie_station_meta(session: requests.Session) -> Dict[str, StationMeta]:
    rows = session.get(HYDRO_LIVE_URL, timeout=30).json()
    result: Dict[str, StationMeta] = {}
    for row in rows:
        if str(row.get("wojewodztwo", "")).strip().lower() != "lubelskie":
            continue
        latitude = _safe_float(row.get("lat"))
        longitude = _safe_float(row.get("lon"))
        if latitude is None or longitude is None:
            continue
        station_id = str(row.get("id_stacji", "")).strip()
        if not station_id:
            continue
        result[station_id] = StationMeta(
            station_id=station_id,
            station_name=str(row.get("stacja", "")),
            river=str(row.get("rzeka", "")),
            voivodeship=str(row.get("wojewodztwo", "")),
            latitude=latitude,
            longitude=longitude,
        )
    return result


def _iter_daily_rows(
    session: requests.Session,
    station_ids: Set[str],
    years: Iterable[int],
) -> Iterable[Tuple[date, str, float, Optional[float]]]:
    for year in years:
        for month in range(1, 13):
            url = f"{HYDRO_DAILY_BASE}/{year}/codz_{year}_{month:02d}.zip"
            archive = _download_zip(session, url)
            if archive is None:
                continue

            for member in archive.namelist():
                if not member.lower().endswith(".csv"):
                    continue
                text = archive.read(member).decode("cp1250", errors="ignore")
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
                        day = date(int(year_str), int(month_cal_str), int(day_str))
                    except ValueError:
                        continue

                    yield day, station_id, float(water_level), flow


def _build_day_snapshots(rows: Iterable[Tuple[date, str, float, Optional[float]]]) -> List[DaySnapshot]:
    levels_by_day: Dict[date, Dict[str, float]] = defaultdict(dict)
    flows_by_day: Dict[date, Dict[str, float]] = defaultdict(dict)

    for day, station_id, level, flow in rows:
        levels_by_day[day][station_id] = level
        if flow is not None:
            flows_by_day[day][station_id] = flow

    snapshots: List[DaySnapshot] = []
    for day in sorted(levels_by_day.keys()):
        levels = list(levels_by_day[day].values())
        flows = list(flows_by_day.get(day, {}).values())
        snapshots.append(
            DaySnapshot(
                day=day,
                station_count=len(levels),
                mean_level=statistics.fmean(levels),
                max_level=max(levels),
                p90_level=_percentile(levels, 0.9),
                mean_flow=statistics.fmean(flows) if flows else 0.0,
                max_flow=max(flows) if flows else 0.0,
                levels_by_station=levels_by_day[day],
                flows_by_station=flows_by_day.get(day, {}),
            )
        )
    return snapshots


FLOOD_WARNING_DATE_REGEX = re.compile(r"data i godzina wydania:\s*(\d{2}\.\d{2}\.\d{4})")


def _extract_warning_issue_date(text: str) -> Optional[date]:
    match = FLOOD_WARNING_DATE_REGEX.search(text)
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
    return any(any(keyword in hay for keyword in FLOOD_WARNING_KEYWORDS) for hay in haystacks)


def _iter_warning_days(session: requests.Session, years: Iterable[int]) -> Set[date]:
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


def _nearest_station_features(
    hospital: HospitalContext,
    snapshot: DaySnapshot,
    station_meta: Dict[str, StationMeta],
) -> Tuple[float, float, float]:
    nearest_distance = float("inf")
    nearest_station_level = 0.0
    nearest_station_flow = 0.0

    for station_id, meta in station_meta.items():
        distance = _haversine_km(hospital.latitude, hospital.longitude, meta.latitude, meta.longitude)
        if distance < nearest_distance:
            nearest_distance = distance
            nearest_station_level = float(snapshot.levels_by_station.get(station_id, 0.0))
            nearest_station_flow = float(snapshot.flows_by_station.get(station_id, 0.0))

    if not math.isfinite(nearest_distance):
        nearest_distance = 9999.0

    return nearest_distance, nearest_station_level, nearest_station_flow


def _build_feature_vector(
    snapshot: DaySnapshot,
    prev_snapshot: DaySnapshot,
    hospital: HospitalContext,
    station_meta: Dict[str, StationMeta],
) -> List[float]:
    hospital_total_beds = float(hospital.total_beds)
    hospital_free_beds = float(hospital.free_beds)
    nearest_distance, nearest_station_level, nearest_station_flow = _nearest_station_features(hospital, snapshot, station_meta)

    return [
        snapshot.station_count,
        snapshot.mean_level,
        snapshot.max_level,
        snapshot.p90_level,
        snapshot.mean_flow,
        snapshot.max_flow,
        snapshot.mean_level - prev_snapshot.mean_level,
        snapshot.max_level - prev_snapshot.max_level,
        hospital.latitude,
        hospital.longitude,
        hospital_total_beds,
        hospital_free_beds,
        nearest_distance,
        nearest_station_level,
        nearest_station_flow,
    ]


def _load_hospitals(db_path: Path | str = "szpitale_lublin.sqlite3") -> List[HospitalContext]:
    repository = Repository(ensure_database(db_path))
    hospitals = []
    for row in repository.list_hospitals():
        latitude = row.get("latitude")
        longitude = row.get("longitude")
        if latitude is None or longitude is None:
            continue
        total_beds = 0
        free_beds = 0
        for department in row.get("departments", []):
            total_beds += int(department.get("total_beds") or 0)
            free_beds += int(department.get("free_beds") or 0)
        hospitals.append(
            HospitalContext(
                hospital_name=str(row.get("hospital_name", "")),
                address=str(row.get("address", "")),
                latitude=float(latitude),
                longitude=float(longitude),
                total_beds=total_beds,
                free_beds=free_beds,
                hospital_id=int(row.get("id")),
            )
        )
    return hospitals


def build_training_data(
    start_year: int,
    end_year: int,
    db_path: Path | str = "szpitale_lublin.sqlite3",
) -> Tuple[List[List[float]], List[int], List[date], List[str], Dict[str, StationMeta]]:
    years = list(range(start_year, end_year + 1))
    with requests.Session() as session:
        station_meta = _get_lubelskie_station_meta(session)
        daily_rows = list(_iter_daily_rows(session, set(station_meta.keys()), years))
        snapshots = _build_day_snapshots(daily_rows)
        warning_days = _iter_warning_days(session, years)

    hospitals = _load_hospitals(db_path)
    if len(snapshots) < 3:
        raise RuntimeError("Too few daily snapshots to train")
    if not hospitals:
        raise RuntimeError("No hospitals with coordinates found in database")

    x: List[List[float]] = []
    y: List[int] = []
    dates: List[date] = []
    hospitals_used: List[str] = []

    for idx in range(1, len(snapshots)):
        snapshot = snapshots[idx]
        prev_snapshot = snapshots[idx - 1]
        for hospital in hospitals:
            vector = _build_feature_vector(snapshot, prev_snapshot, hospital, station_meta)
            x.append(vector)
            y.append(1 if snapshot.day in warning_days else 0)
            dates.append(snapshot.day)
            hospitals_used.append(hospital.hospital_name)

    return x, y, dates, hospitals_used, station_meta


def train_hospital_model(
    start_year: int = 2010,
    end_year: int = 2024,
    db_path: Path | str = "szpitale_lublin.sqlite3",
    artifacts_dir: Path | str = "flood_ml/artifacts",
) -> Dict[str, Any]:
    x, y, dates, hospitals_used, station_meta = build_training_data(start_year, end_year, db_path=db_path)
    positives = sum(y)
    if len(x) < 1000:
        raise RuntimeError(f"Too few training rows: {len(x)}")
    if positives < 20:
        raise RuntimeError(f"Too few positive samples: {positives}")

    unique_dates = sorted(set(dates))
    split_date = unique_dates[int(len(unique_dates) * 0.8)]
    train_indices = [idx for idx, day in enumerate(dates) if day < split_date]
    test_indices = [idx for idx, day in enumerate(dates) if day >= split_date]

    x_train = [x[idx] for idx in train_indices]
    y_train = [y[idx] for idx in train_indices]
    x_test = [x[idx] for idx in test_indices]
    y_test = [y[idx] for idx in test_indices]

    pos_train = sum(y_train)
    neg_train = len(y_train) - pos_train
    if pos_train == 0:
        raise RuntimeError("Training split has no positive samples")
    pos_weight = neg_train / pos_train if pos_train else 1.0
    sample_weight = [pos_weight if label == 1 else 1.0 for label in y_train]

    model = HistGradientBoostingClassifier(
        max_iter=300,
        learning_rate=0.05,
        max_depth=6,
        min_samples_leaf=20,
        l2_regularization=0.1,
        random_state=42,
    )
    model.fit(x_train, y_train, sample_weight=sample_weight)

    y_pred = model.predict(x_test)
    y_proba = model.predict_proba(x_test)[:, 1]
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    auc = roc_auc_score(y_test, y_proba) if len(set(y_test)) > 1 else 0.0

    artifacts_dir = Path(artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    model_path = artifacts_dir / "flood_hospital_risk_model.joblib"
    meta_path = artifacts_dir / "flood_hospital_risk_model_meta.json"

    joblib.dump(model, model_path)
    meta = {
        "start_year": start_year,
        "end_year": end_year,
        "train_rows": len(x_train),
        "test_rows": len(x_test),
        "positive_rows": positives,
        "auc": auc,
        "classification_report": report,
        "feature_names": FEATURE_NAMES,
        "model_path": str(model_path),
        "station_count": len(station_meta),
        "hospital_count": len(set(hospitals_used)),
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def predict_hospital_flood_risk(
    hospital: HospitalContext,
    model_path: Path | str = "flood_ml/artifacts/flood_hospital_risk_model.joblib",
    cache_path: Path | str = "flood_ml/artifacts/live_hospital_feature_cache.json",
) -> Dict[str, Any]:
    model_path = Path(model_path)
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    model = joblib.load(model_path)
    with requests.Session() as session:
        rows = session.get(HYDRO_LIVE_URL, timeout=30).json()
        station_meta = _get_lubelskie_station_meta(session)

    lub_levels = [_safe_float(row.get("stan_wody")) for row in rows if str(row.get("wojewodztwo", "")).strip().lower() == "lubelskie"]
    lub_levels = [v for v in lub_levels if v is not None and v < 9999]
    lub_flows = [_safe_float(row.get("przelyw")) for row in rows if str(row.get("wojewodztwo", "")).strip().lower() == "lubelskie"]
    lub_flows = [v for v in lub_flows if v is not None and v < 99999]
    if not lub_levels:
        raise RuntimeError("No valid live water level data for lubelskie stations")

    current = DaySnapshot(
        day=datetime.now(timezone.utc).date(),
        station_count=len(lub_levels),
        mean_level=statistics.fmean(lub_levels),
        max_level=max(lub_levels),
        p90_level=_percentile(lub_levels, 0.9),
        mean_flow=statistics.fmean(lub_flows) if lub_flows else 0.0,
        max_flow=max(lub_flows) if lub_flows else 0.0,
        levels_by_station={
            str(row.get("id_stacji", "")).strip(): float(v)
            for row, v in ((row, _safe_float(row.get("stan_wody"))) for row in rows)
            if str(row.get("wojewodztwo", "")).strip().lower() == "lubelskie" and v is not None and v < 9999
        },
        flows_by_station={
            str(row.get("id_stacji", "")).strip(): float(v)
            for row, v in ((row, _safe_float(row.get("przelyw"))) for row in rows)
            if str(row.get("wojewodztwo", "")).strip().lower() == "lubelskie" and v is not None and v < 99999
        },
    )

    cache_path = Path(cache_path)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    prev_payload: Dict[str, float] = {}
    if cache_path.exists():
        try:
            prev_payload = {k: float(v) for k, v in json.loads(cache_path.read_text(encoding="utf-8")).get("features", {}).items()}
        except Exception:
            prev_payload = {}

    prev_mean = prev_payload.get("mean_level", current.mean_level)
    prev_max = prev_payload.get("max_level", current.max_level)

    prev_snapshot = DaySnapshot(
        day=current.day,
        station_count=current.station_count,
        mean_level=prev_mean,
        max_level=prev_max,
        p90_level=prev_payload.get("p90_level", current.p90_level),
        mean_flow=prev_payload.get("mean_flow", current.mean_flow),
        max_flow=prev_payload.get("max_flow", current.max_flow),
        levels_by_station=current.levels_by_station,
        flows_by_station=current.flows_by_station,
    )

    vector = _build_feature_vector(current, prev_snapshot, hospital, station_meta)
    probability = float(model.predict_proba([vector])[0][1])
    prediction = int(probability >= 0.5)

    nearest_distance, nearest_station_level, nearest_station_flow = _nearest_station_features(hospital, current, station_meta)
    nearest_station = None
    if station_meta:
        nearest_station_id = min(
            station_meta.keys(),
            key=lambda sid: _haversine_km(hospital.latitude, hospital.longitude, station_meta[sid].latitude, station_meta[sid].longitude),
        )
        meta = station_meta[nearest_station_id]
        nearest_station = {
            "station_id": meta.station_id,
            "station_name": meta.station_name,
            "river": meta.river,
            "distance_km": round(nearest_distance, 3),
            "station_water_level_cm": int(nearest_station_level) if nearest_station_level else None,
            "station_flow_m3s": round(nearest_station_flow, 3) if nearest_station_flow else None,
        }

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    cache_path.write_text(
        json.dumps(
            {
                "saved_at": now,
                "features": {
                    "station_count": current.station_count,
                    "mean_level": current.mean_level,
                    "max_level": current.max_level,
                    "p90_level": current.p90_level,
                    "mean_flow": current.mean_flow,
                    "max_flow": current.max_flow,
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return {
        "predicted_at": now,
        "hospital": {
            "hospital_id": hospital.hospital_id,
            "hospital_name": hospital.hospital_name,
            "address": hospital.address,
            "latitude": hospital.latitude,
            "longitude": hospital.longitude,
            "total_beds": hospital.total_beds,
            "free_beds": hospital.free_beds,
        },
        "flood_warning_risk_probability": round(probability, 4),
        "predicted_warning_risk": prediction,
        "nearest_station": nearest_station,
        "features": {
            "station_count": current.station_count,
            "mean_level": current.mean_level,
            "max_level": current.max_level,
            "p90_level": current.p90_level,
            "mean_flow": current.mean_flow,
            "max_flow": current.max_flow,
            "delta_mean_level_1d": current.mean_level - prev_mean,
            "delta_max_level_1d": current.max_level - prev_max,
            "hospital_latitude": hospital.latitude,
            "hospital_longitude": hospital.longitude,
            "hospital_total_beds": float(hospital.total_beds),
            "hospital_free_beds": float(hospital.free_beds),
            "nearest_station_distance_km": round(nearest_distance, 3),
            "nearest_station_level_cm": float(nearest_station_level),
            "nearest_station_flow_m3s": float(nearest_station_flow),
        },
        "model_path": str(model_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train hospital-aware flood-risk model for Lubelskie")
    parser.add_argument("--start-year", type=int, default=2010)
    parser.add_argument("--end-year", type=int, default=2024)
    parser.add_argument("--db-path", default="szpitale_lublin.sqlite3")
    parser.add_argument("--artifacts-dir", default="flood_ml/artifacts")
    args = parser.parse_args()

    meta = train_hospital_model(
        start_year=args.start_year,
        end_year=args.end_year,
        db_path=args.db_path,
        artifacts_dir=args.artifacts_dir,
    )
    print(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
