from __future__ import annotations

from datetime import datetime, timezone
import math
import sqlite3
from typing import Any, Dict, List, Tuple

import requests

IMGW_HYDRO_URL = "http://danepubliczne.imgw.pl/api/data/hydro/"
IMGW_WARNINGS_HYDRO_URL = "http://danepubliczne.imgw.pl/api/data/warningshydro"
IMGW_WARNINGS_METEO_URL = "http://danepubliczne.imgw.pl/api/data/warningsmeteo"

FLOOD_LIKE_METEO_EVENTS = (
    "Intensywne opady",
    "Silny deszcz",
    "Ulewa",
    "Burze",
    "Deszcz",
)


def _fetch_json_list(session: requests.Session, url: str, timeout: int = 20) -> List[Dict[str, Any]]:
    response = session.get(url, timeout=timeout)
    # IMGW endpoint for warningshydro can return 404 with JSON payload when no active warnings exist.
    if response.status_code == 404:
        try:
            payload = response.json()
        except ValueError:
            response.raise_for_status()
        if isinstance(payload, dict) and payload.get("message") == "No products were found":
            return []
        response.raise_for_status()

    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, list) else []


def _to_float(value: Any) -> float | None:
    try:
        if value is None or str(value).strip() == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    try:
        if value is None or str(value).strip() == "":
            return None
        return int(float(str(value).replace(",", ".")))
    except (TypeError, ValueError):
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def get_flood_overview(timeout: int = 20) -> Dict[str, Any]:
    with requests.Session() as session:
        hydro_warnings = _fetch_json_list(session, IMGW_WARNINGS_HYDRO_URL, timeout=timeout)
        meteo_warnings = _fetch_json_list(session, IMGW_WARNINGS_METEO_URL, timeout=timeout)
        hydro_stations = _fetch_json_list(session, IMGW_HYDRO_URL, timeout=timeout)

    meteo_flood_like = [
        warning
        for warning in meteo_warnings
        if any(event.lower() in str(warning.get("nazwa_zdarzenia", "")).lower() for event in FLOOD_LIKE_METEO_EVENTS)
    ]

    lubelskie = [
        row
        for row in hydro_stations
        if str(row.get("wojewodztwo", "")).strip().lower() == "lubelskie"
    ]

    def station_score(row: Dict[str, Any]) -> int:
        level = _to_int(row.get("stan_wody"))
        return level if level is not None else -1

    top_stations = sorted(lubelskie, key=station_score, reverse=True)[:20]
    top_station_items = [
        {
            "station_id": str(row.get("id_stacji", "")),
            "station_name": str(row.get("stacja", "")),
            "river": str(row.get("rzeka", "")),
            "voivodeship": str(row.get("wojewodztwo", "")),
            "latitude": _to_float(row.get("lat")),
            "longitude": _to_float(row.get("lon")),
            "water_level_cm": _to_int(row.get("stan_wody")),
            "measured_at": str(row.get("stan_wody_data_pomiaru", "")),
        }
        for row in top_stations
    ]

    return {
        "source": "IMGW public data API",
        "hydro_warnings_count": len(hydro_warnings),
        "hydro_warnings": hydro_warnings,
        "meteo_flood_like_warnings_count": len(meteo_flood_like),
        "meteo_flood_like_warnings": meteo_flood_like,
        "lubelskie_station_count": len(lubelskie),
        "lubelskie_top_stations": top_station_items,
    }


def _persist_hydro_snapshot(connection: sqlite3.Connection, hydro_stations: List[Dict[str, Any]], collected_at: str) -> None:
    for row in hydro_stations:
        connection.execute(
            """
            INSERT INTO hydro_station_observations (
                station_id, station_name, river, voivodeship,
                latitude, longitude, water_level_cm, measured_at_source, collected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(row.get("id_stacji", "")),
                str(row.get("stacja", "")),
                str(row.get("rzeka", "")),
                str(row.get("wojewodztwo", "")),
                _to_float(row.get("lat")),
                _to_float(row.get("lon")),
                _to_int(row.get("stan_wody")),
                str(row.get("stan_wody_data_pomiaru", "")),
                collected_at,
            ),
        )


def _hours_between(start_iso: str, end_iso: str) -> float:
    try:
        start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    except ValueError:
        return 0.0
    delta = end - start
    return max(delta.total_seconds() / 3600.0, 0.0)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius * c


def _percentile(values: List[int], q: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    position = (len(sorted_values) - 1) * q
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return float(sorted_values[lower])
    weight = position - lower
    return float(sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight)


def _hospital_capacity(hospital: Dict[str, Any]) -> Dict[str, Any]:
    total_free_beds = 0
    total_beds = 0
    for department in hospital.get("departments", []):
        total_free_beds += int(department.get("free_beds") or 0)
        beds = department.get("total_beds")
        if beds is not None:
            total_beds += int(beds)

    return {
        "id": int(hospital["id"]),
        "hospital_name": hospital["hospital_name"],
        "address": hospital["address"],
        "latitude": float(hospital["latitude"]),
        "longitude": float(hospital["longitude"]),
        "total_free_beds": total_free_beds,
        "total_beds": total_beds,
    }


def predict_flood_risk(
    connection: sqlite3.Connection,
    hospitals: List[Dict[str, Any]],
    history_points_per_station: int = 24,
) -> Dict[str, Any]:
    with requests.Session() as session:
        hydro_stations = _fetch_json_list(session, IMGW_HYDRO_URL, timeout=20)

    collected_at = _now_iso()
    _persist_hydro_snapshot(connection, hydro_stations, collected_at)

    station_rows = connection.execute(
        """
        SELECT
            station_id,
            station_name,
            river,
            voivodeship,
            latitude,
            longitude,
            water_level_cm,
            measured_at_source,
            collected_at
        FROM hydro_station_observations
        WHERE station_id IN (
            SELECT station_id
            FROM hydro_station_observations
            WHERE voivodeship = 'lubelskie'
            GROUP BY station_id
        )
        ORDER BY station_id, collected_at DESC
        """
    ).fetchall()

    by_station: Dict[str, List[sqlite3.Row]] = {}
    for row in station_rows:
        by_station.setdefault(str(row["station_id"]), []).append(row)

    latest_levels_all = [
        int(rows[0]["water_level_cm"])
        for rows in by_station.values()
        if rows and rows[0]["water_level_cm"] is not None
    ]
    global_p50 = _percentile(latest_levels_all, 0.5) if latest_levels_all else 0.0
    global_p90 = _percentile(latest_levels_all, 0.9) if latest_levels_all else 1.0

    risk_stations: List[Dict[str, Any]] = []
    for station_id, rows in by_station.items():
        latest = rows[0]
        latest_level = latest["water_level_cm"]
        if latest_level is None or latest["latitude"] is None or latest["longitude"] is None:
            continue

        history_slice = rows[: max(3, history_points_per_station)]
        history_levels = [int(r["water_level_cm"]) for r in history_slice if r["water_level_cm"] is not None]
        if len(history_levels) >= 3:
            median_level = _percentile(history_levels, 0.5)
            p90_level = _percentile(history_levels, 0.9)
            if p90_level <= 0:
                p90_level = max(history_levels)

            start_point = history_slice[-1]
            hours = _hours_between(str(start_point["collected_at"]), str(latest["collected_at"]))
            trend_per_hour = (int(latest_level) - int(start_point["water_level_cm"] or latest_level)) / hours if hours > 0 else 0.0
        else:
            # Fallback for early runs when local history is still short.
            median_level = global_p50
            p90_level = max(global_p90, 1.0)
            trend_per_hour = 0.0

        level_pressure = int(latest_level) / p90_level if p90_level > 0 else 0.0
        anomaly_pressure = (int(latest_level) - median_level) / max(p90_level - median_level, 1.0)
        trend_pressure = max(trend_per_hour / 5.0, 0.0)
        risk_score = max(0.0, min(1.0, 0.55 * level_pressure + 0.30 * anomaly_pressure + 0.15 * trend_pressure))

        if risk_score >= 0.75:
            risk_level = "high"
        elif risk_score >= 0.5:
            risk_level = "medium"
        else:
            risk_level = "low"

        risk_stations.append(
            {
                "station_id": station_id,
                "station_name": str(latest["station_name"]),
                "river": str(latest["river"]),
                "latitude": float(latest["latitude"]),
                "longitude": float(latest["longitude"]),
                "latest_water_level_cm": int(latest_level),
                "median_water_level_cm": round(median_level, 2),
                "trend_cm_per_hour": round(trend_per_hour, 3),
                "risk_score": round(risk_score, 3),
                "risk_level": risk_level,
            }
        )

    risk_stations_sorted = sorted(risk_stations, key=lambda row: row["risk_score"], reverse=True)
    active_risk_stations = [row for row in risk_stations_sorted if row["risk_level"] in {"high", "medium"}]

    at_risk_hospitals: List[Dict[str, Any]] = []
    for hospital in hospitals:
        latitude = hospital.get("latitude")
        longitude = hospital.get("longitude")
        if latitude is None or longitude is None:
            continue

        h_lat = float(latitude)
        h_lon = float(longitude)
        nearest = None
        nearest_distance = 1e9
        for station in active_risk_stations:
            distance = _haversine_km(h_lat, h_lon, station["latitude"], station["longitude"])
            if distance < nearest_distance:
                nearest = station
                nearest_distance = distance

        if nearest is None:
            continue

        threshold_km = 25.0 if nearest["risk_level"] == "medium" else 40.0
        if nearest_distance > threshold_km:
            continue

        capacity = _hospital_capacity(hospital)
        at_risk_hospitals.append(
            {
                **capacity,
                "nearest_risk_station_id": nearest["station_id"],
                "nearest_risk_station_name": nearest["station_name"],
                "distance_km": round(nearest_distance, 3),
                "station_risk_level": nearest["risk_level"],
                "station_risk_score": nearest["risk_score"],
            }
        )

    at_risk_hospitals_sorted = sorted(
        at_risk_hospitals,
        key=lambda row: (row["station_risk_score"], -row["total_free_beds"]),
        reverse=True,
    )

    return {
        "source": "IMGW hydro + local historical cache",
        "prediction_generated_at": collected_at,
        "history_points_per_station": history_points_per_station,
        "risk_stations_count": len(active_risk_stations),
        "risk_stations": active_risk_stations,
        "at_risk_hospitals_count": len(at_risk_hospitals_sorted),
        "at_risk_hospitals": at_risk_hospitals_sorted,
    }


def _point_in_bbox(lat: float, lon: float, bbox: Dict[str, float]) -> bool:
    return (
        bbox["min_latitude"] <= lat <= bbox["max_latitude"]
        and bbox["min_longitude"] <= lon <= bbox["max_longitude"]
    )


def _point_in_polygon(lat: float, lon: float, polygon: List[Tuple[float, float]]) -> bool:
    inside = False
    points = len(polygon)
    if points < 3:
        return False

    j = points - 1
    for i in range(points):
        yi, xi = polygon[i]
        yj, xj = polygon[j]
        intersects = ((xi > lon) != (xj > lon)) and (
            lat < (yj - yi) * (lon - xi) / ((xj - xi) if (xj - xi) != 0 else 1e-12) + yi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def build_flood_area_impact(
    hospitals: List[Dict[str, Any]],
    mode: str,
    candidate_limit: int,
    min_latitude: float | None = None,
    max_latitude: float | None = None,
    min_longitude: float | None = None,
    max_longitude: float | None = None,
    polygon: List[Tuple[float, float]] | None = None,
) -> Dict[str, Any]:
    mode_normalized = (mode or "bbox").strip().lower()
    if mode_normalized not in {"bbox", "polygon"}:
        raise ValueError("mode must be 'bbox' or 'polygon'")

    if mode_normalized == "bbox":
        if None in (min_latitude, max_latitude, min_longitude, max_longitude):
            raise ValueError("bbox mode requires min/max latitude and longitude")
        bbox = {
            "min_latitude": float(min(min_latitude, max_latitude)),
            "max_latitude": float(max(min_latitude, max_latitude)),
            "min_longitude": float(min(min_longitude, max_longitude)),
            "max_longitude": float(max(min_longitude, max_longitude)),
        }
    else:
        if polygon is None or len(polygon) < 3:
            raise ValueError("polygon mode requires at least 3 points")

    impacted: List[Dict[str, Any]] = []
    safe: List[Dict[str, Any]] = []

    for hospital in hospitals:
        latitude = hospital.get("latitude")
        longitude = hospital.get("longitude")
        if latitude is None or longitude is None:
            continue

        lat = float(latitude)
        lon = float(longitude)
        in_risk_area = (
            _point_in_bbox(lat, lon, bbox)
            if mode_normalized == "bbox"
            else _point_in_polygon(lat, lon, polygon or [])
        )

        capacity = _hospital_capacity(hospital)
        if in_risk_area:
            impacted.append(capacity)
        else:
            safe.append(capacity)

    impacted_sorted = sorted(impacted, key=lambda row: row["total_free_beds"], reverse=True)
    safe_sorted = sorted(safe, key=lambda row: row["total_free_beds"], reverse=True)

    return {
        "mode": mode_normalized,
        "impacted_hospitals_count": len(impacted_sorted),
        "impacted_hospitals": impacted_sorted,
        "redirect_candidates_count": min(len(safe_sorted), candidate_limit),
        "redirect_candidates": safe_sorted[:candidate_limit],
    }
