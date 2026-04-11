from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class DepartmentSummary(BaseModel):
    id: int = Field(..., description="Source department id")
    name: str
    report_url: str
    created_at: str
    updated_at: str


class HospitalSummary(BaseModel):
    id: int
    hospital_name: str
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class DepartmentHospitalItem(BaseModel):
    hospital_id: int
    hospital_name: str
    address: str
    free_beds: int
    total_beds: Optional[int] = None
    created_at: str
    updated_at: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class DepartmentHospitalsResponse(BaseModel):
    department_id: int
    department_name: str
    hospitals: List[DepartmentHospitalItem]


class HospitalDepartmentItem(BaseModel):
    department_id: int
    department_name: str
    free_beds: int
    total_beds: Optional[int] = None
    created_at: str
    updated_at: str


class HospitalItem(BaseModel):
    id: int
    hospital_name: str
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: str
    updated_at: str
    departments: List[HospitalDepartmentItem]


class HospitalListResponse(BaseModel):
    hospitals: List[HospitalItem]


class ApiStats(BaseModel):
    hospitals: int
    departments: int
    hospital_departments: int
    hospitals_missing_coordinates: int
    last_refresh_at: str = ""
    last_successful_ingestion_at: str = ""


class ApiInfo(BaseModel):
    message: str
    endpoints: List[str]


class IngestionRequest(BaseModel):
    base_url: str = Field("https://szpitale.lublin.uw.gov.pl/page/", description="Data source url")
    timeout: int = 30
    retries: int = 3
    retry_backoff: float = 1.0
    sleep_seconds: float = 0.2
    geocode_timeout: int = 5


class IngestionTaskItem(BaseModel):
    id: int
    status: str
    progress: int = 0
    current_step: str = ""
    message: str = ""
    started_at: str
    finished_at: Optional[str] = None
    created_at: str
    updated_at: str
    error_message: str = ""


class IngestionTaskResponse(BaseModel):
    task: IngestionTaskItem


class FloodStationItem(BaseModel):
    station_id: str
    station_name: str
    river: str
    voivodeship: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    water_level_cm: Optional[int] = None
    measured_at: str = ""


class FloodOverviewResponse(BaseModel):
    source: str
    hydro_warnings_count: int
    hydro_warnings: List[Dict[str, Any]]
    meteo_flood_like_warnings_count: int
    meteo_flood_like_warnings: List[Dict[str, Any]]
    lubelskie_station_count: int
    lubelskie_top_stations: List[FloodStationItem]


class MapPoint(BaseModel):
    latitude: float
    longitude: float


class FloodAreaRequest(BaseModel):
    mode: str = Field("bbox", description="Selection mode: bbox or polygon")
    min_latitude: Optional[float] = None
    max_latitude: Optional[float] = None
    min_longitude: Optional[float] = None
    max_longitude: Optional[float] = None
    polygon: List[MapPoint] = Field(default_factory=list)
    candidate_limit: int = Field(10, ge=1, le=50)


class HospitalCapacityItem(BaseModel):
    id: int
    hospital_name: str
    address: str
    latitude: float
    longitude: float
    total_free_beds: int
    total_beds: int


class FloodAreaImpactResponse(BaseModel):
    mode: str
    impacted_hospitals_count: int
    impacted_hospitals: List[HospitalCapacityItem]
    redirect_candidates_count: int
    redirect_candidates: List[HospitalCapacityItem]


class FloodRiskStationItem(BaseModel):
    station_id: str
    station_name: str
    river: str
    latitude: float
    longitude: float
    latest_water_level_cm: int
    median_water_level_cm: Optional[float] = None
    trend_cm_per_hour: float
    risk_score: float
    risk_level: str


class FloodRiskHospitalItem(BaseModel):
    id: int
    hospital_name: str
    address: str
    latitude: float
    longitude: float
    total_free_beds: int
    total_beds: int
    nearest_risk_station_id: str
    nearest_risk_station_name: str
    distance_km: float
    station_risk_level: str
    station_risk_score: float


class FloodPredictionResponse(BaseModel):
    source: str
    prediction_generated_at: str
    history_points_per_station: int
    risk_stations_count: int
    risk_stations: List[FloodRiskStationItem]
    at_risk_hospitals_count: int
    at_risk_hospitals: List[FloodRiskHospitalItem]
