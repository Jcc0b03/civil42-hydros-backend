export type CameraAlert = 'good' | 'meh' | 'bad';

export type CameraFeed = {
  id: string;
  label: string;
  playerId: string;
  pageUrl: string;
  lat: number;
  lon: number;
  alertLevel: CameraAlert;
  alertText: string;
};

export type TerritoryKind = 'powiat' | 'gmina';

export type TerritoryProperties = {
  id: string;
  name: string;
  fullName: string;
  teryt: string | null;
  kind: TerritoryKind;
  adminType?: string;
};

export type TerritoryFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  TerritoryProperties
>;

export type TerritoryFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  TerritoryProperties
>;

export type PanelId = 'map' | 'live' | 'layers' | 'risk' | 'files';

export type LayerToggles = {
  hospitals: boolean;
  floodZones: boolean;
  cameras: boolean;
  powiatBoundaries: boolean;
  gminaBoundaries: boolean;
};

export type RiverStatus = {
  name: string;
  level: string;
  status: 'critical' | 'warning' | 'stable';
};

// ── Flood overview (IMGW) ──

export type FloodOverviewStation = {
  station_id: string;
  station_name: string;
  river: string;
  voivodeship: string;
  latitude: number | null;
  longitude: number | null;
  water_level_cm: number | null;
  measured_at: string;
};

export type FloodOverviewResponse = {
  source: string;
  hydro_warnings_count: number;
  hydro_warnings: Record<string, unknown>[];
  meteo_flood_like_warnings_count: number;
  meteo_flood_like_warnings: Record<string, unknown>[];
  lubelskie_station_count: number;
  lubelskie_top_stations: FloodOverviewStation[];
};

// ── Flood prediction ──

export type FloodRiskStation = {
  station_id: string;
  station_name: string;
  river: string;
  latitude: number;
  longitude: number;
  latest_water_level_cm: number;
  median_water_level_cm: number | null;
  trend_cm_per_hour: number;
  risk_score: number;
  risk_level: string;
};

export type FloodRiskHospital = {
  id: number;
  hospital_name: string;
  address: string;
  latitude: number;
  longitude: number;
  total_free_beds: number;
  total_beds: number;
  nearest_risk_station_id: string;
  nearest_risk_station_name: string;
  distance_km: number;
  station_risk_level: string;
  station_risk_score: number;
};

export type FloodPredictionResponse = {
  source: string;
  prediction_generated_at: string;
  history_points_per_station: number;
  risk_stations_count: number;
  risk_stations: FloodRiskStation[];
  at_risk_hospitals_count: number;
  at_risk_hospitals: FloodRiskHospital[];
};

export type ApiHospitalDepartment = {
  department_id: number;
  department_name: string;
  free_beds: number;
  total_beds: number | null;
  source_updated_at: string;
  created_at: string;
  updated_at: string;
};

export type ApiHospital = {
  id: number;
  hospital_name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  departments: ApiHospitalDepartment[];
};

export type ApiHospitalListResponse = {
  hospitals: ApiHospital[];
};

export type ApiDepartmentSummary = {
  id: number;
  name: string;
  report_url: string;
  created_at: string;
  updated_at: string;
};

export type ApiStats = {
  hospitals: number;
  departments: number;
  hospital_departments: number;
  hospitals_missing_coordinates: number;
  last_refresh_at: string;
  last_successful_ingestion_at: string;
};

// ── Flood overview (IMGW) ──

export type FloodOverviewStation = {
  station_id: string;
  station_name: string;
  river: string;
  voivodeship: string;
  latitude: number;
  longitude: number;
  water_level_cm: number;
  measured_at: string;
};

export type FloodOverviewResponse = {
  source: string;
  hydro_warnings_count: number;
  hydro_warnings: Record<string, unknown>[];
  meteo_flood_like_warnings_count: number;
  meteo_flood_like_warnings: Record<string, unknown>[];
  lubelskie_station_count: number;
  lubelskie_top_stations: FloodOverviewStation[];
};
