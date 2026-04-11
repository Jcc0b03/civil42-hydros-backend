from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import joblib
import requests

HYDRO_LIVE_URL = "http://danepubliczne.imgw.pl/api/data/hydro/"


def _to_float(value: Any) -> float | None:
    try:
        if value is None or str(value).strip() == "":
            return None
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _aggregate_lubelskie_features(rows: List[Dict[str, Any]]) -> Dict[str, float]:
    lub = [r for r in rows if str(r.get("wojewodztwo", "")).strip().lower() == "lubelskie"]
    levels = [_to_float(r.get("stan_wody")) for r in lub]
    levels = [v for v in levels if v is not None and v < 9999]
    flows = [_to_float(r.get("przelyw")) for r in lub]
    flows = [v for v in flows if v is not None and v < 99999]

    if not levels:
        raise RuntimeError("No valid water level data for lubelskie stations")

    station_count = float(len(levels))
    mean_level = float(sum(levels) / len(levels))
    max_level = float(max(levels))
    sorted_levels = sorted(levels)
    p90_idx = int((len(sorted_levels) - 1) * 0.9)
    p90_level = float(sorted_levels[p90_idx])
    mean_flow = float(sum(flows) / len(flows)) if flows else 0.0
    max_flow = float(max(flows)) if flows else 0.0

    return {
        "station_count": station_count,
        "mean_level": mean_level,
        "max_level": max_level,
        "p90_level": p90_level,
        "mean_flow": mean_flow,
        "max_flow": max_flow,
    }


def _load_cache(path: Path) -> Dict[str, float]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return {k: float(v) for k, v in payload.get("features", {}).items()}
    except Exception:
        return {}


def main() -> None:
    parser = argparse.ArgumentParser(description="Live flood-risk prediction for Lubelskie")
    parser.add_argument("--model", default="flood_ml/artifacts/flood_risk_model.joblib")
    parser.add_argument("--cache", default="flood_ml/artifacts/live_feature_cache.json")
    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    model = joblib.load(model_path)

    rows = requests.get(HYDRO_LIVE_URL, timeout=30).json()
    current = _aggregate_lubelskie_features(rows)

    cache_path = Path(args.cache)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    prev = _load_cache(cache_path)

    prev_mean = prev.get("mean_level", current["mean_level"])
    prev_max = prev.get("max_level", current["max_level"])

    vector = [
        current["station_count"],
        current["mean_level"],
        current["max_level"],
        current["p90_level"],
        current["mean_flow"],
        current["max_flow"],
        current["mean_level"] - prev_mean,
        current["max_level"] - prev_max,
        current["mean_level"] - prev_mean,
        prev_mean,
        prev_max,
    ]

    probability = float(model.predict_proba([vector])[0][1])
    prediction = int(probability >= 0.5)

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    output = {
        "predicted_at": now,
        "flood_warning_risk_probability": round(probability, 4),
        "predicted_warning_risk": prediction,
        "features": current,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))

    cache_path.write_text(
        json.dumps({"saved_at": now, "features": current}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
