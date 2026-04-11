from __future__ import annotations

from typing import Dict, Optional

from pydantic import BaseModel


class FloodMlPredictionResponse(BaseModel):
    predicted_at: str
    flood_warning_risk_probability: float
    predicted_warning_risk: int
    features: Dict[str, float]
    model_path: str


class FloodMlHospitalInput(BaseModel):
    hospital_name: str
    address: str
    latitude: float
    longitude: float
    total_beds: int = 0
    free_beds: int = 0
    hospital_id: Optional[int] = None


class FloodMlHospitalRequest(BaseModel):
    hospital_id: Optional[int] = None
    hospital: Optional[FloodMlHospitalInput] = None


class FloodMlNearestStation(BaseModel):
    station_id: str
    station_name: str
    river: str
    distance_km: float
    station_water_level_cm: Optional[int] = None
    station_flow_m3s: Optional[float] = None


class FloodMlHospitalPredictionResponse(BaseModel):
    predicted_at: str
    hospital: FloodMlHospitalInput
    flood_warning_risk_probability: float
    predicted_warning_risk: int
    nearest_station: Optional[FloodMlNearestStation] = None
    features: Dict[str, float]
    model_path: str
