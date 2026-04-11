from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests

from .database import DEFAULT_DB_PATH, ensure_database
from .flood import build_flood_area_impact, get_flood_overview, predict_flood_risk
from .ingest import build_sqlite_database
from .ml_models import (
    FloodMlHospitalInput,
    FloodMlHospitalPredictionResponse,
    FloodMlHospitalRequest,
    FloodMlPredictionResponse,
)
from .models import (
    ApiInfo,
    ApiStats,
    DepartmentHospitalsResponse,
    DepartmentSummary,
    HospitalItem,
    HospitalListResponse,
    IngestionRequest,
    IngestionTaskItem,
    IngestionTaskResponse,
    FloodOverviewResponse,
    FloodAreaRequest,
    FloodAreaImpactResponse,
    FloodPredictionResponse,
)
from .repository import Repository

DB_PATH = Path(DEFAULT_DB_PATH)


class IngestionService:
    def __init__(self, repository: Repository, db_path: Path) -> None:
        self.repository = repository
        self.db_path = db_path
        self.executor = ThreadPoolExecutor(max_workers=1)
        self.lock = Lock()
        self.running = False

    def start(self, request: IngestionRequest) -> IngestionTaskItem:
        with self.lock:
            if self.running:
                raise HTTPException(status_code=409, detail="Inny ingestion task juz dziala")
            self.running = True

        task_id = self.repository.create_ingestion_task()
        self.executor.submit(self._run_job, task_id, request)
        task = self.repository.get_ingestion_task(task_id)
        if task is None:
            raise HTTPException(status_code=500, detail="Failed to create ingestion task")
        return IngestionTaskItem(**task)

    def _run_job(self, task_id: int, request: IngestionRequest) -> None:
        try:
            def progress_callback(progress: int, step: str, message: str) -> None:
                try:
                    self.repository.update_ingestion_task_progress(
                        task_id,
                        progress=progress,
                        current_step=step,
                        message=message,
                    )
                except Exception:
                    return

            build_sqlite_database(
                db_path=self.db_path,
                base_url=request.base_url,
                timeout=request.timeout,
                retries=request.retries,
                retry_backoff=request.retry_backoff,
                sleep_seconds=request.sleep_seconds,
                geocode_timeout=request.geocode_timeout,
                limit=None,
                progress_callback=progress_callback,
            )

            stats = self.repository.get_stats()
            self.repository.finish_ingestion_task(
                task_id,
                status="success",
                progress=100,
                current_step="done",
                message=(
                    f"Ingestion finished: hospitals={stats['hospitals']}, "
                    f"departments={stats['departments']}"
                ),
            )
        except Exception as error:  # noqa: BLE001
            self.repository.finish_ingestion_task(
                task_id,
                status="failed",
                progress=100,
                current_step="failed",
                message="Ingestion failed",
                error_message=str(error),
            )
        finally:
            with self.lock:
                self.running = False


def create_app(db_path: Path = DB_PATH) -> FastAPI:
    db = ensure_database(db_path)
    repository = Repository(db)
    ingestion_service = IngestionService(repository, db.path)

    app = FastAPI(
        title="Szpitale Lublin API",
        version="1.1.0",
        description=(
            "API oparte o SQLite z danymi szpitali woj. lubelskiego. "
            "Jeżeli brakuje latitude/longitude dla placówki, są uzupełniane podczas budowy bazy "
            "przez OpenStreetMap Nominatim na podstawie adresu."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://laptop-75skiqoe.tail888d9f.ts.net",
            "http://laptop-75skiqoe.tail888d9f.ts.net",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        allow_origin_regex=r"^https?://([a-zA-Z0-9-]+\.)?tail888d9f\.ts\.net(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get(
        "/",
        response_model=ApiInfo,
        tags=["info"],
        summary="API overview",
        description="Returns basic information about the service and a list of available endpoints.",
        response_description="API metadata and endpoint list.",
    )
    def root() -> ApiInfo:
        return ApiInfo(
            message="Hospitals Lublin API",
            endpoints=[
                "/api/health",
                "/api/stats",
                "/api/flood/overview",
                "/api/flood/impact",
                "/api/flood/prediction",
                "/api/flood/ml-prediction",
                "/api/departments",
                "/api/departments/{id}/hospitals",
                "/api/hospitals",
                "/api/ingestion-tasks",
                "/api/ingestion-tasks/{id}",
            ],
        )

    @app.get(
        "/api/health",
        tags=["info"],
        summary="Health check",
        description="Simple liveness probe for API and database path visibility.",
        response_description="Current API health status.",
    )
    def health() -> dict:
        return {"status": "ok", "db_path": str(db.path)}

    @app.get(
        "/api/stats",
        response_model=ApiStats,
        tags=["stats"],
        summary="Get dataset stats",
        description="Returns aggregate counters and freshness metadata for hospitals and departments.",
        response_description="Dataset statistics.",
    )
    def stats() -> ApiStats:
        return ApiStats(**repository.get_stats())

    @app.get(
        "/api/flood/overview",
        response_model=FloodOverviewResponse,
        tags=["flood"],
        summary="Get flood-related signals",
        description=(
            "Returns flood-related context from IMGW public data: hydro warnings, "
            "flood-like meteo warnings, and top hydro stations in Lubelskie."
        ),
        response_description="Flood overview used for crisis triage decisions.",
    )
    def flood_overview() -> FloodOverviewResponse:
        try:
            return FloodOverviewResponse(**get_flood_overview())
        except requests.RequestException as error:
            raise HTTPException(status_code=502, detail=f"Flood data source unavailable: {error}") from error

    @app.post(
        "/api/flood/impact",
        response_model=FloodAreaImpactResponse,
        tags=["flood"],
        summary="Assess hospitals in selected flood area",
        description=(
            "Accepts a selected map area (bbox or polygon) and returns hospitals inside the risk area "
            "plus hospitals outside the area that can receive redirected patients."
        ),
        response_description="Hospitals in risk area and recommended redirect targets.",
    )
    def flood_impact(request: FloodAreaRequest) -> FloodAreaImpactResponse:
        hospitals = repository.list_hospitals()
        polygon = [(point.latitude, point.longitude) for point in request.polygon]
        try:
            payload = build_flood_area_impact(
                hospitals=hospitals,
                mode=request.mode,
                candidate_limit=request.candidate_limit,
                min_latitude=request.min_latitude,
                max_latitude=request.max_latitude,
                min_longitude=request.min_longitude,
                max_longitude=request.max_longitude,
                polygon=polygon,
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        return FloodAreaImpactResponse(**payload)

    @app.get(
        "/api/flood/prediction",
        response_model=FloodPredictionResponse,
        tags=["flood"],
        summary="Predict flood risk from historical water levels",
        description=(
            "Builds a prediction based on current IMGW hydro levels plus historical observations cached "
            "in SQLite. Returns risk stations and hospitals likely to be impacted."
        ),
        response_description="Predicted flood risk stations and at-risk hospitals.",
    )
    def flood_prediction(history_points_per_station: int = 24) -> FloodPredictionResponse:
        if history_points_per_station < 3 or history_points_per_station > 240:
            raise HTTPException(status_code=422, detail="history_points_per_station must be between 3 and 240")

        try:
            with db.connect() as connection:
                payload = predict_flood_risk(
                    connection=connection,
                    hospitals=repository.list_hospitals(),
                    history_points_per_station=history_points_per_station,
                )
            return FloodPredictionResponse(**payload)
        except requests.RequestException as error:
            raise HTTPException(status_code=502, detail=f"Flood data source unavailable: {error}") from error

    @app.get(
        "/api/flood/ml-prediction",
        response_model=FloodMlPredictionResponse,
        tags=["flood"],
        summary="Predict flood risk with ML model",
        description=(
            "Returns the current flood-risk probability predicted by the standalone ML model trained on IMGW history."
        ),
        response_description="ML-based flood-risk prediction.",
    )
    def flood_ml_prediction() -> FloodMlPredictionResponse:
        try:
            from flood_ml.runtime import predict_live_flood_risk

            return FloodMlPredictionResponse(**predict_live_flood_risk())
        except FileNotFoundError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except requests.RequestException as error:
            raise HTTPException(status_code=502, detail=f"Flood data source unavailable: {error}") from error

    @app.post(
        "/api/flood/ml-prediction",
        response_model=FloodMlHospitalPredictionResponse,
        tags=["flood"],
        summary="Predict flood risk for a hospital",
        description="Accepts a hospital with latitude and longitude and returns hospital-aware ML flood risk.",
        response_description="Hospital-specific ML flood-risk prediction.",
    )
    def flood_ml_hospital_prediction(request: FloodMlHospitalRequest) -> FloodMlHospitalPredictionResponse:
        try:
            from flood_ml.hospital_model import HospitalContext, predict_hospital_flood_risk

            if request.hospital_id is not None:
                hospital_row = repository.get_hospital(request.hospital_id)
                if hospital_row is None:
                    raise HTTPException(status_code=404, detail="Hospital not found")
                hospital_payload = FloodMlHospitalInput(
                    hospital_id=hospital_row["id"],
                    hospital_name=hospital_row["hospital_name"],
                    address=hospital_row["address"],
                    latitude=float(hospital_row["latitude"]),
                    longitude=float(hospital_row["longitude"]),
                    total_beds=int(hospital_row.get("total_beds") or 0),
                    free_beds=int(hospital_row.get("free_beds") or 0),
                )
            else:
                hospital_payload = request.hospital

            if hospital_payload is None:
                raise HTTPException(status_code=422, detail="Either hospital_id or hospital must be provided")

            hospital = hospital_payload
            payload = predict_hospital_flood_risk(
                HospitalContext(
                    hospital_name=hospital.hospital_name,
                    address=hospital.address,
                    latitude=hospital.latitude,
                    longitude=hospital.longitude,
                    total_beds=hospital.total_beds,
                    free_beds=hospital.free_beds,
                    hospital_id=hospital.hospital_id,
                )
            )
            return FloodMlHospitalPredictionResponse(**payload)
        except FileNotFoundError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except requests.RequestException as error:
            raise HTTPException(status_code=502, detail=f"Flood data source unavailable: {error}") from error

    @app.get(
        "/api/departments",
        response_model=List[DepartmentSummary],
        tags=["departments"],
        summary="List departments",
        description="Returns all active departments available in the source system.",
        response_description="List of departments.",
    )
    def list_departments() -> List[DepartmentSummary]:
        return [DepartmentSummary(**row) for row in repository.list_departments()]

    @app.get(
        "/api/departments/{department_id}/hospitals",
        response_model=DepartmentHospitalsResponse,
        tags=["departments"],
        summary="Get hospitals by department",
        description="Returns hospitals and bed availability for a specific department id.",
        response_description="Department details with hospital rows.",
    )
    def department_hospitals(department_id: int) -> DepartmentHospitalsResponse:
        payload = repository.get_department_hospitals(department_id)
        if not payload["department_name"]:
            raise HTTPException(status_code=404, detail="Department not found")
        return DepartmentHospitalsResponse(**payload)

    @app.get(
        "/api/hospitals",
        response_model=HospitalListResponse,
        tags=["hospitals"],
        summary="List hospitals with departments",
        description="Returns active hospitals with nested departments and bed availability.",
        response_description="List of hospitals and nested department rows.",
    )
    def hospitals() -> HospitalListResponse:
        return HospitalListResponse(hospitals=[HospitalItem(**row) for row in repository.list_hospitals()])

    @app.get(
        "/api/ingestion-tasks",
        response_model=List[IngestionTaskItem],
        tags=["ingestion"],
        summary="List ingestion tasks",
        description="Returns ingestion task history ordered from newest to oldest.",
        response_description="List of ingestion tasks.",
    )
    def list_ingestion_tasks() -> List[IngestionTaskItem]:
        return [IngestionTaskItem(**row) for row in repository.list_ingestion_tasks()]

    @app.get(
        "/api/ingestion-tasks/{task_id}",
        response_model=IngestionTaskResponse,
        tags=["ingestion"],
        summary="Get ingestion task",
        description="Returns detailed progress and status for a single ingestion task.",
        response_description="Single ingestion task payload.",
    )
    def get_ingestion_task(task_id: int) -> IngestionTaskResponse:
        task = repository.get_ingestion_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Ingestion task not found")
        return IngestionTaskResponse(task=IngestionTaskItem(**task))

    @app.post(
        "/api/ingestion-tasks",
        response_model=IngestionTaskResponse,
        status_code=202,
        tags=["ingestion"],
        summary="Start ingestion",
        description="Starts a new background ingestion task. Only one task can run at a time.",
        response_description="Created ingestion task in running state.",
    )
    def start_ingestion_task(request: IngestionRequest = IngestionRequest()) -> IngestionTaskResponse:
        task = ingestion_service.start(request)
        return IngestionTaskResponse(task=task)

    return app


app = create_app()
