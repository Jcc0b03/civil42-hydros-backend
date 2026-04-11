from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .database import Database


@dataclass
class Repository:
    db: Database

    def now_iso(self) -> str:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    def get_stats(self) -> Dict[str, Any]:
        with self.db.connect() as connection:
            hospitals = connection.execute(
                "SELECT COUNT(*) AS count FROM hospitals WHERE deleted_at IS NULL"
            ).fetchone()["count"]
            departments = connection.execute(
                "SELECT COUNT(*) AS count FROM departments WHERE deleted_at IS NULL"
            ).fetchone()["count"]
            hospital_departments = connection.execute(
                "SELECT COUNT(*) AS count FROM hospital_departments WHERE deleted_at IS NULL"
            ).fetchone()["count"]
            missing_coordinates = connection.execute(
                "SELECT COUNT(*) AS count FROM hospitals WHERE deleted_at IS NULL AND (latitude IS NULL OR longitude IS NULL)"
            ).fetchone()["count"]
            last_refresh = connection.execute(
                "SELECT MAX(updated_at) AS updated_at FROM hospital_departments WHERE deleted_at IS NULL"
            ).fetchone()["updated_at"]
            last_success = connection.execute(
                "SELECT MAX(finished_at) AS finished_at FROM ingestion_tasks WHERE status = 'success'"
            ).fetchone()["finished_at"]

        return {
            "hospitals": int(hospitals),
            "departments": int(departments),
            "hospital_departments": int(hospital_departments),
            "hospitals_missing_coordinates": int(missing_coordinates),
            "last_refresh_at": last_refresh or "",
            "last_successful_ingestion_at": last_success or "",
        }

    def list_departments(self) -> List[Dict[str, Any]]:
        with self.db.connect() as connection:
            rows = connection.execute(
                """
                SELECT source_department_id AS id, department_name AS name, report_url, created_at, updated_at
                FROM departments
                WHERE deleted_at IS NULL
                ORDER BY department_name, source_department_id
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def get_department_hospitals(self, source_department_id: int) -> Dict[str, Any]:
        with self.db.connect() as connection:
            department = connection.execute(
                """
                SELECT id, source_department_id, department_name
                FROM departments
                WHERE source_department_id = ? AND deleted_at IS NULL
                """,
                (source_department_id,),
            ).fetchone()
            if department is None:
                return {
                    "department_id": source_department_id,
                    "department_name": "",
                    "hospitals": [],
                }

            rows = connection.execute(
                """
                SELECT
                    h.id AS hospital_id,
                    h.hospital_name,
                    h.address,
                    hd.free_beds,
                    hd.total_beds,
                    hd.created_at,
                    hd.updated_at,
                    h.latitude,
                    h.longitude
                FROM hospital_departments hd
                JOIN hospitals h ON h.id = hd.hospital_id
                WHERE hd.department_id = ?
                  AND hd.deleted_at IS NULL
                  AND h.deleted_at IS NULL
                ORDER BY h.hospital_name, h.address
                """,
                (department["id"],),
            ).fetchall()

        return {
            "department_id": int(department["source_department_id"]),
            "department_name": department["department_name"],
            "hospitals": [dict(row) for row in rows],
        }

    def list_hospitals(self) -> List[Dict[str, Any]]:
        with self.db.connect() as connection:
            hospitals = connection.execute(
                """
                SELECT id, hospital_name, address, latitude, longitude, created_at, updated_at
                FROM hospitals
                WHERE deleted_at IS NULL
                ORDER BY hospital_name, address
                """
            ).fetchall()

            departments = connection.execute(
                """
                SELECT
                    hd.hospital_id,
                    d.source_department_id AS department_id,
                    d.department_name,
                    hd.free_beds,
                    hd.total_beds,
                                        hd.created_at,
                                        hd.updated_at
                FROM hospital_departments hd
                JOIN departments d ON d.id = hd.department_id
                WHERE hd.deleted_at IS NULL
                  AND d.deleted_at IS NULL
                ORDER BY hd.hospital_id, d.department_name
                """
            ).fetchall()

        by_hospital: Dict[int, List[Dict[str, Any]]] = {}
        for row in departments:
            by_hospital.setdefault(int(row["hospital_id"]), []).append(
                {
                    "department_id": int(row["department_id"]),
                    "department_name": row["department_name"],
                    "free_beds": int(row["free_beds"]),
                    "total_beds": row["total_beds"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                }
            )

        result: List[Dict[str, Any]] = []
        for hospital in hospitals:
            result.append(
                {
                    "id": int(hospital["id"]),
                    "hospital_name": hospital["hospital_name"],
                    "address": hospital["address"],
                    "latitude": hospital["latitude"],
                    "longitude": hospital["longitude"],
                    "created_at": hospital["created_at"],
                    "updated_at": hospital["updated_at"],
                    "departments": by_hospital.get(int(hospital["id"]), []),
                }
            )
        return result

    def get_hospital(self, hospital_id: int) -> Optional[Dict[str, Any]]:
        with self.db.connect() as connection:
            hospital = connection.execute(
                """
                SELECT id, hospital_name, address, latitude, longitude, created_at, updated_at
                FROM hospitals
                WHERE id = ? AND deleted_at IS NULL
                """,
                (hospital_id,),
            ).fetchone()
            if hospital is None:
                return None

            departments = connection.execute(
                """
                SELECT free_beds, total_beds
                FROM hospital_departments
                WHERE hospital_id = ? AND deleted_at IS NULL
                """,
                (hospital_id,),
            ).fetchall()

        total_beds = 0
        free_beds = 0
        for department in departments:
            total_beds += int(department["total_beds"] or 0)
            free_beds += int(department["free_beds"] or 0)

        return {
            "id": int(hospital["id"]),
            "hospital_name": hospital["hospital_name"],
            "address": hospital["address"],
            "latitude": hospital["latitude"],
            "longitude": hospital["longitude"],
            "created_at": hospital["created_at"],
            "updated_at": hospital["updated_at"],
            "departments": [],
            "total_beds": total_beds,
            "free_beds": free_beds,
        }

    def create_ingestion_task(self) -> int:
        now = self.now_iso()
        with self.db.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO ingestion_tasks (
                    status, progress, current_step, message, started_at, created_at, updated_at
                ) VALUES ('running', 0, 'queued', '', ?, ?, ?)
                """,
                (now, now, now),
            )
            return int(cursor.lastrowid)

    def update_ingestion_task_progress(
        self,
        task_id: int,
        *,
        progress: int,
        current_step: str,
        message: str,
    ) -> None:
        now = self.now_iso()
        with self.db.connect() as connection:
            connection.execute(
                """
                UPDATE ingestion_tasks
                SET progress = ?, current_step = ?, message = ?, updated_at = ?
                WHERE id = ?
                """,
                (progress, current_step, message, now, task_id),
            )

    def finish_ingestion_task(
        self,
        task_id: int,
        *,
        status: str,
        progress: int,
        current_step: str,
        message: str,
        error_message: str = "",
    ) -> None:
        now = self.now_iso()
        with self.db.connect() as connection:
            connection.execute(
                """
                UPDATE ingestion_tasks
                SET status = ?, progress = ?, current_step = ?, message = ?,
                    finished_at = ?, updated_at = ?, error_message = ?
                WHERE id = ?
                """,
                (status, progress, current_step, message, now, now, error_message, task_id),
            )

    def get_ingestion_task(self, task_id: int) -> Optional[Dict[str, Any]]:
        with self.db.connect() as connection:
            row = connection.execute(
                "SELECT * FROM ingestion_tasks WHERE id = ?",
                (task_id,),
            ).fetchone()
        return dict(row) if row else None

    def list_ingestion_tasks(self) -> List[Dict[str, Any]]:
        with self.db.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM ingestion_tasks ORDER BY id DESC"
            ).fetchall()
        return [dict(row) for row in rows]
