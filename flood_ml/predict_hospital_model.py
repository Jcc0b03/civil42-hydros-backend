from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flood_ml.hospital_model import HospitalContext, predict_hospital_flood_risk


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict flood risk for a specific hospital")
    parser.add_argument("--hospital-name", required=True)
    parser.add_argument("--address", required=True)
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)
    parser.add_argument("--total-beds", type=int, default=0)
    parser.add_argument("--free-beds", type=int, default=0)
    parser.add_argument("--hospital-id", type=int, default=None)
    args = parser.parse_args()

    hospital = HospitalContext(
        hospital_name=args.hospital_name,
        address=args.address,
        latitude=args.latitude,
        longitude=args.longitude,
        total_beds=args.total_beds,
        free_beds=args.free_beds,
        hospital_id=args.hospital_id,
    )
    payload = predict_hospital_flood_risk(hospital)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
