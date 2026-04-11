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
