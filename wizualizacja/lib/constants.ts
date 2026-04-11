import type { CameraFeed, PanelId, RiverStatus } from "./types";

export const LUBELSKIE_CENTER: [number, number] = [51.2465, 22.5684];
export const LUBELSKIE_INITIAL_ZOOM = 8;
export const CAMERA_CLUSTER_ZOOM_THRESHOLD = 9;

export const CAMERA_FEEDS: CameraFeed[] = [
  {
    id: "lublin-brama-krakowska",
    label: "Brama Krakowska",
    playerId: "2877",
    pageUrl:
      "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-brame-krakowska/",
    lat: 51.2489,
    lon: 22.5673,
    alertLevel: "good",
    alertText: "Bez zagrożeń",
  },
  {
    id: "lublin-plac-litewski",
    label: "Plac Litewski",
    playerId: "2870",
    pageUrl:
      "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-plac-litewski/",
    lat: 51.2469,
    lon: 22.5538,
    alertLevel: "meh",
    alertText: "Obserwacja wzmożona",
  },
  {
    id: "lublin-brama-krolewska",
    label: "Brama Krakowska (ul. Królewska)",
    playerId: "2876",
    pageUrl:
      "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-brame-krakowska-ul-krolewska/",
    lat: 51.2477,
    lon: 22.5688,
    alertLevel: "bad",
    alertText: "Alert krytyczny",
  },
  {
    id: "lublin-park-ludowy",
    label: "Park Ludowy",
    playerId: "2871",
    pageUrl:
      "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-park-ludowy/",
    lat: 51.2352,
    lon: 22.5866,
    alertLevel: "good",
    alertText: "Bez zagrożeń",
  },
  {
    id: "lublin-krakowskie-przedmiescie",
    label: "Krakowskie Przedmieście",
    playerId: "6788",
    pageUrl:
      "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-krakowskie-przedmiescie/",
    lat: 51.2482,
    lon: 22.5579,
    alertLevel: "meh",
    alertText: "Obserwacja wzmożona",
  },
  {
    id: "lublin-arena",
    label: "Arena Lublin",
    playerId: "2872",
    pageUrl:
      "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-arene-lublin/",
    lat: 51.2314,
    lon: 22.5279,
    alertLevel: "bad",
    alertText: "Alert krytyczny",
  },
];

export const SIDEBAR_ITEMS: Array<{
  id: PanelId;
  label: string;
  icon: string;
}> = [
  { id: "map", label: "Mapa", icon: "map" },
  { id: "live", label: "Na żywo", icon: "emergency" },
  { id: "layers", label: "Warstwy", icon: "layers" },
  { id: "risk", label: "Ryzyko", icon: "analytics" },
  { id: "files", label: "Dane", icon: "description" },
];

export const RIVER_TICKER: RiverStatus[] = [
  { name: "Bug", level: "4.2m", status: "critical" },
  { name: "Wieprz", level: "2.1m", status: "stable" },
  { name: "Wisła", level: "3.5m", status: "warning" },
  { name: "San", level: "1.8m", status: "stable" },
  { name: "Tyśmienica", level: "2.4m", status: "warning" },
  { name: "Huczwa", level: "1.1m", status: "stable" },
];
