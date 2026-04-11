from __future__ import annotations

import importlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Optional, Set, Tuple

import requests

from .database import Database, ensure_database
from .geocoding import Coordinates, geocode_address, parse_coordinates_from_url, resolve_map_url

SCRAPER_MODULE_NAME = "scraper_szpitale_lublin"


def _load_scraper_module():
    return importlib.import_module(SCRAPER_MODULE_NAME)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_int(value: object, default: Optional[int] = None) -> Optional[int]:
    text = str(value).strip()
    if not text or text == "-":
        return default
    try:
        return int(text)
    except ValueError:
        return default


def _get_or_create_department(connection, record: Dict[str, object], now: str) -> int:
    source_department_id = parse_int(record.get("department_report_id"), default=0) or 0
    department_name = str(record.get("department", "")).strip()
    report_url = str(record.get("department_report_url", "")).strip()

    row = connection.execute(
        """
        SELECT id FROM departments
        WHERE source_department_id = ?
        """,
        (source_department_id,),
    ).fetchone()
    if row is not None:
        connection.execute(
            """
            UPDATE departments
            SET department_name = ?, report_url = ?, updated_at = ?, deleted_at = NULL
            WHERE id = ?
            """,
            (department_name, report_url, now, row["id"]),
        )
        return int(row["id"])

    cursor = connection.execute(
        """
        INSERT INTO departments (source_department_id, department_name, report_url, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, NULL)
        """,
        (source_department_id, department_name, report_url, now, now),
    )
    return int(cursor.lastrowid)


def _get_or_create_hospital(connection, session: requests.Session, record: Dict[str, object], now: str, geocode_timeout: int, retries: int, retry_backoff: float) -> int:
    hospital_name = str(record.get("hospital_name", "")).strip()
    address = str(record.get("address", "")).strip()
    county = str(record.get("county", "")).strip()
    map_url = str(record.get("map_url", "")).strip()

    row = connection.execute(
        """
        SELECT id, latitude, longitude
        FROM hospitals
        WHERE hospital_name = ? AND address = ?
        """,
        (hospital_name, address),
    ).fetchone()
    resolved_map_url = resolve_map_url(
        session,
        map_url,
        timeout=max(8, min(geocode_timeout, 15)),
        retries=retries,
        retry_backoff=retry_backoff,
    )

    def resolve_coordinates() -> Coordinates:
        coords = parse_coordinates_from_url(map_url)
        if coords.latitude is not None and coords.longitude is not None:
            return coords

        coords = parse_coordinates_from_url(resolved_map_url)
        if coords.latitude is not None and coords.longitude is not None:
            return coords

        try:
            return geocode_address(
                session,
                address=address,
                county=county,
                timeout=geocode_timeout,
                retries=retries,
                retry_backoff=retry_backoff,
            )
        except requests.RequestException:
            return Coordinates(None, None, "nominatim_error")

    if row is not None:
        latitude = row["latitude"]
        longitude = row["longitude"]
        geocode_source = ""
        if latitude is None or longitude is None:
            coords = resolve_coordinates()
            latitude = coords.latitude
            longitude = coords.longitude
            geocode_source = coords.source

        connection.execute(
            """
            UPDATE hospitals
            SET latitude = COALESCE(?, latitude),
                longitude = COALESCE(?, longitude),
                geocode_source = CASE WHEN ? <> '' THEN ? ELSE geocode_source END,
                source_map_url = ?,
                source_map_url_resolved = ?,
                updated_at = ?,
                deleted_at = NULL
            WHERE id = ?
            """,
            (
                latitude,
                longitude,
                geocode_source,
                geocode_source,
                map_url,
                resolved_map_url,
                now,
                row["id"],
            ),
        )
        return int(row["id"])

    # Geocode only once for new hospitals.
    coords = resolve_coordinates()
    geocode_source = coords.source

    cursor = connection.execute(
        """
        INSERT INTO hospitals (
            hospital_name, address, latitude, longitude, geocode_source,
            source_map_url, source_map_url_resolved, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            hospital_name,
            address,
            coords.latitude,
            coords.longitude,
            geocode_source,
            map_url,
            resolved_map_url,
            now,
            now,
        ),
    )
    return int(cursor.lastrowid)


def _upsert_hospital_department(connection, hospital_id: int, department_id: int, record: Dict[str, object], now: str) -> None:
    free_beds = parse_int(record.get("free_places"), default=0) or 0
    total_beds = parse_int(record.get("total_places"), default=None)
    category = str(record.get("category", "")).strip()
    phone = str(record.get("phone", "")).strip()
    fax = str(record.get("fax", "")).strip()
    notes = str(record.get("notes", "")).strip()

    row = connection.execute(
        """
        SELECT id FROM hospital_departments
        WHERE hospital_id = ? AND department_id = ?
        """,
        (hospital_id, department_id),
    ).fetchone()
    if row is None:
        connection.execute(
            """
            INSERT INTO hospital_departments (
                department_id, hospital_id, total_beds, free_beds,
                category, phone, fax, notes, created_at, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                department_id,
                hospital_id,
                total_beds,
                free_beds,
                category,
                phone,
                fax,
                notes,
                now,
                now,
            ),
        )
    else:
        connection.execute(
            """
            UPDATE hospital_departments
            SET total_beds = ?, free_beds = ?, category = ?,
                phone = ?, fax = ?, notes = ?, updated_at = ?, deleted_at = NULL
            WHERE id = ?
            """,
            (
                total_beds,
                free_beds,
                category,
                phone,
                fax,
                notes,
                now,
                row["id"],
            ),
        )


def _backfill_missing_hospital_coordinates(
    connection,
    session: requests.Session,
    now: str,
    geocode_timeout: int,
    retries: int,
    retry_backoff: float,
) -> int:
    rows = connection.execute(
        """
        SELECT id, address, source_map_url
        FROM hospitals
        WHERE deleted_at IS NULL
          AND (latitude IS NULL OR longitude IS NULL)
        """
    ).fetchall()

    updated = 0
    for row in rows:
        source_map_url = str(row["source_map_url"] or "").strip()
        resolved_map_url = resolve_map_url(
            session,
            source_map_url,
            timeout=max(8, min(geocode_timeout, 15)),
            retries=retries,
            retry_backoff=retry_backoff,
        )

        coords = parse_coordinates_from_url(source_map_url)
        if coords.latitude is None or coords.longitude is None:
            coords = parse_coordinates_from_url(resolved_map_url)

        if coords.latitude is None or coords.longitude is None:
            try:
                coords = geocode_address(
                    session,
                    address=str(row["address"] or "").strip(),
                    county="",
                    timeout=geocode_timeout,
                    retries=retries,
                    retry_backoff=retry_backoff,
                )
            except requests.RequestException:
                coords = Coordinates(None, None, "nominatim_error")

        if coords.latitude is None or coords.longitude is None:
            continue

        connection.execute(
            """
            UPDATE hospitals
            SET latitude = ?, longitude = ?, geocode_source = ?,
                source_map_url_resolved = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                coords.latitude,
                coords.longitude,
                coords.source,
                resolved_map_url,
                now,
                row["id"],
            ),
        )
        updated += 1

    return updated


def build_sqlite_database(
    db_path: Path | str,
    base_url: str,
    timeout: int = 30,
    retries: int = 3,
    retry_backoff: float = 1.0,
    sleep_seconds: float = 0.2,
    geocode_timeout: int = 5,
    limit: Optional[int] = None,
    progress_callback: Optional[Callable[[int, str, str], None]] = None,
) -> Database:
    scraper = _load_scraper_module()
    db = ensure_database(db_path)
    run_started_at = _now_iso()

    with requests.Session() as session, db.connect() as connection:
        session.headers.update(scraper.HEADERS)

        if progress_callback:
            progress_callback(1, "fetch_departments", "Fetching department list")

        list_soup = scraper.fetch_html_with_retry(
            session,
            base_url,
            timeout,
            retries,
            retry_backoff,
        )
        departments = scraper.parse_departments(list_soup)
        if limit is not None:
            departments = departments[:limit]

        total = max(len(departments), 1)

        for index, department in enumerate(departments, start=1):
            progress = 5 + int((index - 1) / total * 85)
            if progress_callback:
                progress_callback(progress, f"department {index}/{total}", f"Fetching {department.department_name}")

            try:
                report_soup = scraper.fetch_html_with_retry(
                    session,
                    department.report_url,
                    max(8, min(timeout, 15)),
                    1,
                    retry_backoff,
                )
            except requests.RequestException as error:
                if progress_callback:
                    progress_callback(progress, f"department {index}/{total}", f"Skipped: {error.__class__.__name__}")
                continue

            rows = scraper.parse_report_page(department, report_soup)
            now = _now_iso()
            for record in rows:
                hospital_id = _get_or_create_hospital(
                    connection,
                    session,
                    record,
                    now,
                    geocode_timeout,
                    retries,
                    retry_backoff,
                )
                department_id = _get_or_create_department(connection, record, now)
                _upsert_hospital_department(connection, hospital_id, department_id, record, now)

            # Make data visible immediately after each department is fetched.
            connection.commit()
            if progress_callback:
                progress_callback(progress, f"department {index}/{total}", f"Upserted {len(rows)} rows")

        if progress_callback:
            progress_callback(90, "geocoding", "Backfilling missing hospital coordinates")
        backfilled = _backfill_missing_hospital_coordinates(
            connection,
            session,
            _now_iso(),
            geocode_timeout,
            retries,
            retry_backoff,
        )
        connection.commit()
        if progress_callback:
            progress_callback(91, "geocoding", f"Backfilled coordinates for {backfilled} hospitals")

        if progress_callback:
            progress_callback(92, "cleanup", "Marking stale records as deleted")

        now = _now_iso()
        connection.execute(
            "UPDATE hospital_departments SET deleted_at = ? WHERE updated_at < ? AND deleted_at IS NULL",
            (now, run_started_at),
        )
        connection.execute(
            "UPDATE hospitals SET deleted_at = ? WHERE updated_at < ? AND deleted_at IS NULL",
            (now, run_started_at),
        )
        connection.execute(
            "UPDATE departments SET deleted_at = ? WHERE updated_at < ? AND deleted_at IS NULL",
            (now, run_started_at),
        )
        connection.commit()

    if progress_callback:
        progress_callback(100, "done", "Ingestion finished")

    return db
