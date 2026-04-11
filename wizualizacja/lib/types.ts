export type CameraAlert = "good" | "meh" | "bad";

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

export type TerritoryKind = "powiat" | "gmina";

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

export type PanelId = "map" | "live" | "layers" | "risk" | "files";

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
  status: "critical" | "warning" | "stable";
};

export type HydroStation = {
  station: string;
  river: string;
  province: string;
  level_cm: string | null;
  level_date: string | null;
  temperature: string | null;
  warning_level: string | null;
  alarm_level: string | null;
  trend: string | null;
  status: "critical" | "warning" | "stable";
};

export type FloodWarning = {
  id: string | null;
  region: string | null;
  level: string | null;
  phenomenon: string | null;
  start: string | null;
  end: string | null;
  description: string | null;
  probability: string | null;
};

export type HospitalFloodStatus = "evacuate" | "at_risk" | "redirect" | "operational";

export type FloodHospital = {
  name: string;
  category: string;
  lat: number;
  lon: number;
  flood_status: HospitalFloodStatus;
  nearest_threat_station: string | null;
  threat_distance_km: number | null;
};

export type FloodHospitalsResponse = {
  timestamp: string;
  summary: {
    total: number;
    evacuate: number;
    at_risk: number;
    redirect: number;
  };
  hydro_alerts: HydroStation[];
  hospitals: FloodHospital[];
};
