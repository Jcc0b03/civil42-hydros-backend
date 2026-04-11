from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DEFAULT_DB_PATH = Path("szpitale_lublin.sqlite3")

SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS hospitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hospital_name TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    geocode_source TEXT NOT NULL DEFAULT '',
    source_map_url TEXT NOT NULL DEFAULT '',
    source_map_url_resolved TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE(hospital_name, address)
);

CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_department_id INTEGER NOT NULL UNIQUE,
    department_name TEXT NOT NULL,
    report_url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS hospital_departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER NOT NULL,
    hospital_id INTEGER NOT NULL,
    total_beds INTEGER,
    free_beds INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    fax TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY(hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
    FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE CASCADE,
    UNIQUE(hospital_id, department_id)
);

CREATE TABLE IF NOT EXISTS ingestion_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    current_step TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    finished_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    error_message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS hydro_station_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    station_name TEXT NOT NULL,
    river TEXT NOT NULL DEFAULT '',
    voivodeship TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    water_level_cm INTEGER,
    measured_at_source TEXT NOT NULL DEFAULT '',
    collected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hospitals_name_address ON hospitals(hospital_name, address);
CREATE INDEX IF NOT EXISTS idx_hospitals_updated_at ON hospitals(updated_at);
CREATE INDEX IF NOT EXISTS idx_hospital_departments_department_id ON hospital_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_hospital_departments_hospital_id ON hospital_departments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_departments_updated_at ON hospital_departments(updated_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_tasks_started_at ON ingestion_tasks(started_at);
CREATE INDEX IF NOT EXISTS idx_hydro_obs_station_collected_at ON hydro_station_observations(station_id, collected_at);
CREATE INDEX IF NOT EXISTS idx_hydro_obs_collected_at ON hydro_station_observations(collected_at);

-- Legacy tables retained below (if they already exist in old DB) are not used.
CREATE TABLE IF NOT EXISTS facilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    county TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    updated_at TEXT NOT NULL DEFAULT '',
    map_url TEXT NOT NULL DEFAULT '',
    map_url_resolved TEXT NOT NULL DEFAULT '',
    geocode_source TEXT NOT NULL DEFAULT '',
    UNIQUE(name, address)
);

CREATE TABLE IF NOT EXISTS legacy_departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_report_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    report_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_facility_departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    facility_id INTEGER NOT NULL,
    department_id INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    free_places INTEGER NOT NULL DEFAULT 0,
    total_places INTEGER,
    updated_at TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    fax TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
    FOREIGN KEY(department_id) REFERENCES legacy_departments(id) ON DELETE CASCADE,
    UNIQUE(facility_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_departments_source_report_id ON legacy_departments(source_report_id);
CREATE INDEX IF NOT EXISTS idx_facility_departments_department_id ON legacy_facility_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_facility_departments_facility_id ON legacy_facility_departments(facility_id);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    progress_percent INTEGER NOT NULL DEFAULT 0,
    current_step TEXT NOT NULL DEFAULT '',
    current_action TEXT NOT NULL DEFAULT '',
    records_count INTEGER NOT NULL DEFAULT 0,
    facilities_count INTEGER NOT NULL DEFAULT 0,
    departments_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT NOT NULL DEFAULT ''
);
"""


class Database:
    def __init__(self, path: Path | str = DEFAULT_DB_PATH) -> None:
        self.path = Path(path)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=60)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout=60000")
        connection.execute("PRAGMA journal_mode=WAL")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def init_schema(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript(SCHEMA_SQL)
            self._migrate(connection)

    def _migrate(self, connection: sqlite3.Connection) -> None:
        # Backward-compatible migration for old databases.
        hospital_columns = {row[1] for row in connection.execute("PRAGMA table_info(hospitals)").fetchall()}
        if hospital_columns and "deleted_at" not in hospital_columns:
            connection.execute("ALTER TABLE hospitals ADD COLUMN deleted_at TEXT")
        if hospital_columns and "created_at" not in hospital_columns:
            connection.execute("ALTER TABLE hospitals ADD COLUMN created_at TEXT NOT NULL DEFAULT ''")

        department_columns = {row[1] for row in connection.execute("PRAGMA table_info(departments)").fetchall()}
        if department_columns and "source_department_id" not in department_columns:
            connection.execute("PRAGMA foreign_keys=OFF")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS departments_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_department_id INTEGER NOT NULL UNIQUE,
                    department_name TEXT NOT NULL,
                    report_url TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT
                )
                """
            )
            if "source_report_id" in department_columns and "name" in department_columns:
                connection.execute(
                    """
                    INSERT INTO departments_new (
                        id, source_department_id, department_name, report_url, created_at, updated_at, deleted_at
                    )
                    SELECT
                        id,
                        source_report_id,
                        name,
                        report_url,
                        datetime('now'),
                        datetime('now'),
                        NULL
                    FROM departments
                    """
                )
            connection.execute("DROP TABLE departments")
            connection.execute("ALTER TABLE departments_new RENAME TO departments")
            connection.execute("PRAGMA foreign_keys=ON")

        task_columns = {row[1] for row in connection.execute("PRAGMA table_info(ingestion_tasks)").fetchall()}
        if task_columns and "error_message" not in task_columns:
            connection.execute("ALTER TABLE ingestion_tasks ADD COLUMN error_message TEXT NOT NULL DEFAULT ''")

        hospital_department_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(hospital_departments)").fetchall()
        }
        if hospital_department_columns and "source_updated_at" in hospital_department_columns:
            connection.execute("PRAGMA foreign_keys=OFF")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS hospital_departments_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    department_id INTEGER NOT NULL,
                    hospital_id INTEGER NOT NULL,
                    total_beds INTEGER,
                    free_beds INTEGER NOT NULL DEFAULT 0,
                    category TEXT NOT NULL DEFAULT '',
                    phone TEXT NOT NULL DEFAULT '',
                    fax TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT,
                    FOREIGN KEY(hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
                    FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE CASCADE,
                    UNIQUE(hospital_id, department_id)
                )
                """
            )
            connection.execute(
                """
                INSERT INTO hospital_departments_new (
                    id, department_id, hospital_id, total_beds, free_beds,
                    category, phone, fax, notes, created_at, updated_at, deleted_at
                )
                SELECT
                    id, department_id, hospital_id, total_beds, free_beds,
                    category, phone, fax, notes, created_at, updated_at, deleted_at
                FROM hospital_departments
                """
            )
            connection.execute("DROP TABLE hospital_departments")
            connection.execute("ALTER TABLE hospital_departments_new RENAME TO hospital_departments")
            connection.execute("PRAGMA foreign_keys=ON")

        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_departments_source_department_id ON departments(source_department_id)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_hydro_obs_station_collected_at ON hydro_station_observations(station_id, collected_at)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_hydro_obs_collected_at ON hydro_station_observations(collected_at)"
        )

    def has_data(self) -> bool:
        if not self.path.exists():
            return False
        with self.connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS count FROM hospitals WHERE deleted_at IS NULL").fetchone()
            return bool(row and row["count"])


def ensure_database(path: Path | str = DEFAULT_DB_PATH) -> Database:
    db = Database(path)
    db.init_schema()
    return db
