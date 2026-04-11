"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  LayersControl,
  MapContainer,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";

import { GraphEdge, GraphNode } from "@/components/GraphCanvas";

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
  onCameraSelect: (camera: CameraFeed) => void;
  apiUrl: string;
};

export type CameraFeed = {
  id: string;
  label: string;
  playerId: string;
  pageUrl: string;
  lat: number;
  lon: number;
  alertLevel: "good" | "meh" | "bad";
  alertText: string;
};

type GeoPoint = {
  node_id: string;
  node_type: string;
  node_data: Record<string, unknown>;
  lat: number;
  lon: number;
};

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });
const DEFAULT_GLOBE_ALTITUDE = 2.2;
const MIN_GLOBE_ALTITUDE = 0.55;
const MAX_GLOBE_ALTITUDE = 3.0;
const MAP_SWITCH_ALTITUDE = 0.60;
const MAP_TO_GLOBE_ZOOM_THRESHOLD = 1.15;
const LUBELSKIE_CENTER: [number, number] = [51.2465, 22.5684];
const LUBELSKIE_INITIAL_ZOOM = 8;
const CAMERA_CLUSTER_ZOOM_THRESHOLD = 7;
const LUBELSKIE_BORDER: [number, number][] = [
  [52.1900, 22.4800],
  [52.0500, 23.7500],
  [51.7300, 24.1300],
  [50.9800, 24.0000],
  [50.2600, 23.3200],
  [50.2400, 22.7600],
  [50.2700, 21.9000],
  [50.7600, 21.6500],
  [51.3100, 21.7300],
  [51.9300, 22.0600],
  [52.1900, 22.4800],
];
const CAMERA_FEEDS: CameraFeed[] = [
  {
    id: "lublin-brama-krakowska",
    label: "Widok na Brame Krakowska",
    playerId: "2877",
    pageUrl: "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-brame-krakowska/",
    lat: 51.2489,
    lon: 22.5673,
    alertLevel: "good",
    alertText: "git",
  },
  {
    id: "lublin-plac-litewski",
    label: "Widok na Plac Litewski",
    playerId: "2870",
    pageUrl: "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-plac-litewski/",
    lat: 51.2469,
    lon: 22.5538,
    alertLevel: "meh",
    alertText: "tak sobie",
  },
  {
    id: "lublin-brama-krolewska",
    label: "Widok na Brame Krakowska (ul. Krolewska)",
    playerId: "2876",
    pageUrl: "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-brame-krakowska-ul-krolewska/",
    lat: 51.2477,
    lon: 22.5688,
    alertLevel: "bad",
    alertText: "chujnia",
  },
  {
    id: "lublin-park-ludowy",
    label: "Widok na Park Ludowy",
    playerId: "2871",
    pageUrl: "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-park-ludowy/",
    lat: 51.2352,
    lon: 22.5866,
    alertLevel: "good",
    alertText: "git",
  },
  {
    id: "lublin-krakowskie-przedmiescie",
    label: "Widok na Krakowskie Przedmiescie",
    playerId: "6788",
    pageUrl: "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-krakowskie-przedmiescie/",
    lat: 51.2482,
    lon: 22.5579,
    alertLevel: "meh",
    alertText: "tak sobie",
  },
  {
    id: "lublin-arena",
    label: "Widok na Arene Lublin",
    playerId: "2872",
    pageUrl: "https://lublin.eu/lublin/o-miescie/lublin-na-zywo/widok-na-arene-lublin/",
    lat: 51.2314,
    lon: 22.5279,
    alertLevel: "bad",
    alertText: "chujnia",
  },
];

const MOCK_COORDS: Record<string, { lat: number; lon: number }> = {
  "person:jan-kowalski": { lat: 51.2464, lon: 22.5669 },
  "person:anna-nowak": { lat: 51.2518, lon: 22.5798 },
  "org:baltic-logistics": { lat: 51.2376, lon: 22.5442 },
  "domain:bl-cargo.net": { lat: 51.2584, lon: 22.6021 },
  "ip:91.240.11.17": { lat: 51.2249, lon: 22.5717 },
  "wallet:0xA2F9": { lat: 51.2711, lon: 22.5306 },
};

const NODE_TYPE_STYLE: Record<
  string,
  { stroke: string; fill: string; labelClass: string; glow: string; globe: string }
> = {
  person: {
    stroke: "#0a1a34",
    fill: "#37b7ff",
    labelClass: "map-node-label map-node-label-person",
    glow: "drop-shadow(0 0 6px rgba(55, 183, 255, 0.45))",
    globe: "#57c6ff",
  },
  organization: {
    stroke: "#052316",
    fill: "#2fd37d",
    labelClass: "map-node-label map-node-label-org",
    glow: "drop-shadow(0 0 6px rgba(47, 211, 125, 0.42))",
    globe: "#54e09a",
  },
  domain: {
    stroke: "#2c1800",
    fill: "#f6b34a",
    labelClass: "map-node-label map-node-label-domain",
    glow: "drop-shadow(0 0 6px rgba(246, 179, 74, 0.4))",
    globe: "#ffc975",
  },
  ip_address: {
    stroke: "#1c112f",
    fill: "#b286ff",
    labelClass: "map-node-label map-node-label-ip",
    glow: "drop-shadow(0 0 6px rgba(178, 134, 255, 0.45))",
    globe: "#c3a2ff",
  },
  crypto_wallet: {
    stroke: "#2a0718",
    fill: "#f067ad",
    labelClass: "map-node-label map-node-label-wallet",
    glow: "drop-shadow(0 0 6px rgba(240, 103, 173, 0.42))",
    globe: "#ff93c9",
  },
  generic: {
    stroke: "#111820",
    fill: "#c3d2e3",
    labelClass: "map-node-label",
    glow: "none",
    globe: "#c9d7e7",
  },
};

const EDGE_TYPE_STYLE: Record<string, { color: string; glow: string }> = {
  controls: { color: "#f067ad", glow: "drop-shadow(0 0 4px rgba(240, 103, 173, 0.4))" },
  owns: { color: "#2fd37d", glow: "drop-shadow(0 0 4px rgba(47, 211, 125, 0.4))" },
  resolves_to: { color: "#37b7ff", glow: "drop-shadow(0 0 4px rgba(55, 183, 255, 0.4))" },
  transacts_with: { color: "#f6b34a", glow: "drop-shadow(0 0 4px rgba(246, 179, 74, 0.36))" },
  generic: { color: "#b4c6d9", glow: "none" },
};

export default function MapCanvas({ nodes, edges, selectedNodeId, onNodeSelect, onCameraSelect, apiUrl }: Props) {
  const enableGeeTerrainLayer = process.env.NEXT_PUBLIC_ENABLE_GEE_TERRAIN_LAYER === "true";
  const [mapZoom, setMapZoom] = useState(5);
  const [isGlobeMode, setIsGlobeMode] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>(LUBELSKIE_CENTER);
  const [requestedZoom, setRequestedZoom] = useState<number | null>(null);
  const [requestedCenter, setRequestedCenter] = useState<[number, number] | null>(null);
  const [geeTileUrl, setGeeTileUrl] = useState<string | null>(null);
  const [globeAltitude, setGlobeAltitude] = useState(DEFAULT_GLOBE_ALTITUDE);
  const [globeInstanceKey, setGlobeInstanceKey] = useState(0);
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Record<string, boolean>>({});
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const globeWrapRef = useRef<HTMLDivElement | null>(null);
  const filterWrapRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<any>(null);
  const globeViewRef = useRef<{ lat: number; lng: number; altitude: number }>({
    lat: 52.0,
    lng: 19.0,
    altitude: DEFAULT_GLOBE_ALTITUDE,
  });
  const [globeSize, setGlobeSize] = useState({ width: 1000, height: 520 });

  useEffect(() => {
    const element = globeWrapRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      const nextWidth = Math.max(320, Math.floor(rect.width));
      const nextHeight = Math.max(240, Math.floor(rect.height));
      setGlobeSize({ width: nextWidth, height: nextHeight });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!globeRef.current) {
      return;
    }

    globeRef.current.pointOfView(globeViewRef.current, 0);
  }, [globeAltitude, globeSize.height, globeSize.width]);

  useEffect(() => {
    if (!enableGeeTerrainLayer) {
      return;
    }

    let cancelled = false;

    async function loadGeeLayer() {
      try {
        const response = await fetch(`${apiUrl}/map/gee/terrain`, { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          enabled: boolean;
          tile_url?: string;
        };

        if (!cancelled && payload.enabled && payload.tile_url) {
          setGeeTileUrl(payload.tile_url);
        }
      } catch {
        // Keep default layers when GEE endpoint is unavailable.
      }
    }

    void loadGeeLayer();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, enableGeeTerrainLayer]);

  const points: GeoPoint[] = useMemo(
    () =>
      nodes.map((node) => {
        const coordinate = MOCK_COORDS[node.node_id] ?? deriveMockCoord(node.node_id);
        return {
          node_id: node.node_id,
          node_type: node.node_type,
          node_data: node.node_data,
          lat: coordinate.lat,
          lon: coordinate.lon,
        };
      }),
    [nodes],
  );

  const availableNodeTypes = useMemo(
    () =>
      Array.from(new Set(points.map((point) => point.node_type)))
        .filter((nodeType) => Boolean(nodeType))
        .sort((a, b) => a.localeCompare(b)),
    [points],
  );

  useEffect(() => {
    setVisibleNodeTypes((previous) => {
      const next: Record<string, boolean> = {};
      for (const nodeType of availableNodeTypes) {
        next[nodeType] = previous[nodeType] ?? true;
      }

      const previousKeys = Object.keys(previous);
      if (previousKeys.length === availableNodeTypes.length) {
        let changed = false;
        for (const nodeType of availableNodeTypes) {
          if (previous[nodeType] !== next[nodeType]) {
            changed = true;
            break;
          }
        }

        if (!changed) {
          return previous;
        }
      }

      return next;
    });
  }, [availableNodeTypes]);

  const filteredPoints = useMemo(
    () => points.filter((point) => visibleNodeTypes[point.node_type] ?? true),
    [points, visibleNodeTypes],
  );

  const pointsById = new Map(filteredPoints.map((point) => [point.node_id, point]));
  const center = getCenter(points);
  const globeMode = isGlobeMode;
  const cameraClusterMode = mapZoom <= CAMERA_CLUSTER_ZOOM_THRESHOLD;

  useEffect(() => {
    if (!globeMode && mapZoom <= MAP_TO_GLOBE_ZOOM_THRESHOLD) {
      const entryAltitude = zoomToGlobeAltitude(mapZoom);
      const entryView = {
        lat: mapCenter[0],
        lng: mapCenter[1],
        altitude: entryAltitude,
      };

      globeViewRef.current = entryView;
      setGlobeAltitude(entryAltitude);
      setIsGlobeMode(true);

      // Apply camera in next frame after globe overlay becomes visible.
      requestAnimationFrame(() => {
        if (globeRef.current) {
          globeRef.current.pointOfView(entryView, 420);
        }
      });
    }
  }, [globeMode, mapCenter, mapZoom]);

  useEffect(() => {
    if (!globeMode || !globeWrapRef.current) {
      return;
    }

    const element = globeWrapRef.current;
    const onWheel = (event: WheelEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      handleGlobeWheelDelta(event.deltaY);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
    };
  }, [globeMode]);

  useEffect(() => {
    if (!globeMode) {
      setGlobeAltitude(DEFAULT_GLOBE_ALTITUDE);
      globeViewRef.current = {
        lat: mapCenter[0],
        lng: mapCenter[1],
        altitude: DEFAULT_GLOBE_ALTITUDE,
      };
      if (globeRef.current) {
        globeRef.current.pointOfView(globeViewRef.current, 0);
      }
    }
  }, [globeMode, mapCenter]);

  useEffect(() => {
    if (globeMode) {
      setIsFilterPanelOpen(false);
    }
  }, [globeMode]);

  useEffect(() => {
    if (!isFilterPanelOpen) {
      return;
    }

    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!filterWrapRef.current?.contains(target)) {
        setIsFilterPanelOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
    };
  }, [isFilterPanelOpen]);

  const globePoints = useMemo(
    () =>
      filteredPoints.map((point) => ({
        id: point.node_id,
        lat: point.lat,
        lng: point.lon,
        size: point.node_id === selectedNodeId ? 0.42 : 0.27,
        color:
          point.node_id === selectedNodeId
            ? "#ffffff"
            : (NODE_TYPE_STYLE[point.node_type] ?? NODE_TYPE_STYLE.generic).globe,
      })),
    [filteredPoints, selectedNodeId],
  );

  const globeArcs = useMemo(
    () =>
      edges
        .map((edge) => {
          const from = pointsById.get(edge.source_id);
          const to = pointsById.get(edge.target_id);
          if (!from || !to) {
            return null;
          }

          return {
            id: `${edge.source_id}-${edge.target_id}-${edge.edge_type}`,
            startLat: from.lat,
            startLng: from.lon,
            endLat: to.lat,
            endLng: to.lon,
          };
        })
        .filter((value): value is NonNullable<typeof value> => value !== null),
    [edges, pointsById],
  );

  function getCurrentGlobeView() {
    const current = globeRef.current?.pointOfView?.();
    if (
      current &&
      typeof current.lat === "number" &&
      typeof current.lng === "number" &&
      typeof current.altitude === "number"
    ) {
      return {
        lat: current.lat,
        lng: current.lng,
        altitude: current.altitude,
      };
    }
    return globeViewRef.current;
  }

  function exitGlobeMode(viewOverride?: { lat: number; lng: number; altitude: number }) {
    const currentView = viewOverride ?? getCurrentGlobeView();
    const nextCenter: [number, number] = [currentView.lat, currentView.lng];
    const nextZoom = globeAltitudeToMapZoom(currentView.altitude);

    setRequestedCenter(nextCenter);
    setRequestedZoom(nextZoom);
    setMapCenter(nextCenter);
    setMapZoom(nextZoom);
    setIsGlobeMode(false);

    setGlobeAltitude(DEFAULT_GLOBE_ALTITUDE);
    globeViewRef.current = {
      lat: currentView.lat,
      lng: currentView.lng,
      altitude: DEFAULT_GLOBE_ALTITUDE,
    };
    if (globeRef.current) {
      globeRef.current.pointOfView(globeViewRef.current, 0);
    }
    setGlobeInstanceKey((prev) => prev + 1);
  }

  function handleGlobeWheelDelta(deltaY: number) {
    const current = getCurrentGlobeView();

    // Continuous zoom based on actual wheel delta, not fixed steps.
    const factor = Math.exp(deltaY * 0.0016);
    const nextAltitude = clamp(current.altitude * factor, MIN_GLOBE_ALTITUDE, MAX_GLOBE_ALTITUDE);
    const nextView = {
      lat: current.lat,
      lng: current.lng,
      altitude: nextAltitude,
    };

    globeViewRef.current = nextView;
    setGlobeAltitude(nextAltitude);
    if (globeRef.current) {
      globeRef.current.pointOfView(nextView, 0);
    }

    if (deltaY < 0 && nextAltitude <= MAP_SWITCH_ALTITUDE) {
      exitGlobeMode(nextView);
    }
  }

  return (
    <div className={`map-shell${globeMode ? " globe-mode" : ""}`}>
      <MapContainer center={LUBELSKIE_CENTER} zoom={LUBELSKIE_INITIAL_ZOOM} minZoom={1} maxZoom={18} scrollWheelZoom className="map-container">
        <ZoomWatcher
          onZoomChange={setMapZoom}
          onCenterChange={setMapCenter}
          requestedZoom={requestedZoom}
          requestedCenter={requestedCenter}
          onAppliedView={() => {
            setRequestedZoom(null);
            setRequestedCenter(null);
          }}
        />
        <LayersControl position="topright">
          {geeTileUrl ? (
            <LayersControl.BaseLayer checked name="Google Earth Engine (terrain)">
              <TileLayer attribution="Google Earth Engine" url={geeTileUrl} maxZoom={18} maxNativeZoom={17} />
            </LayersControl.BaseLayer>
          ) : null}

          <LayersControl.BaseLayer checked={false} name="Mapa standardowa">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={18}
              maxNativeZoom={19}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer checked={!geeTileUrl} name="Satelitarna">
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={18}
              maxNativeZoom={19}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Teren (wysokosc)">
            <TileLayer
              attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              maxZoom={18}
              maxNativeZoom={17}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <Polygon
          positions={LUBELSKIE_BORDER}
          pathOptions={{
            color: "#66a1dc",
            weight: 3,
            opacity: 0.95,
            fillColor: "#2f5f8e",
            fillOpacity: 0.12,
            className: "lubelskie-border",
          }}
        >
          <Tooltip sticky>Krawedz woj. lubelskiego</Tooltip>
        </Polygon>

        {edges.map((edge, index) => {
          const from = pointsById.get(edge.source_id);
          const to = pointsById.get(edge.target_id);
          if (!from || !to) {
            return null;
          }

          const edgeStyle = EDGE_TYPE_STYLE[edge.edge_type] ?? EDGE_TYPE_STYLE.generic;

          return (
            <Polyline
              key={`${edge.source_id}-${edge.target_id}-${edge.edge_type}-${index}`}
              positions={[
                [from.lat, from.lon],
                [to.lat, to.lon],
              ]}
              pathOptions={{ color: edgeStyle.color, weight: 2.8, opacity: 0.88, className: "map-edge-line" }}
            >
              <Tooltip sticky>{edge.edge_type}</Tooltip>
            </Polyline>
          );
        })}

        {filteredPoints.map((point) => {
          const selected = point.node_id === selectedNodeId;
          const style = NODE_TYPE_STYLE[point.node_type] ?? NODE_TYPE_STYLE.generic;
          return (
            <CircleMarker
              key={point.node_id}
              center={[point.lat, point.lon]}
              radius={selected ? 10 : 8}
              pathOptions={{
                color: selected ? "#ffffff" : style.stroke,
                weight: selected ? 2 : 1,
                fillColor: selected ? "#f4f8fd" : style.fill,
                fillOpacity: 0.95,
                className: "map-node-dot",
              }}
              eventHandlers={{
                click: () => onNodeSelect(point.node_id),
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -10]} opacity={1} className={style.labelClass}>
                {point.node_id}
              </Tooltip>
              <Popup>
                <strong>{point.node_id}</strong>
                <br />
                Typ: {point.node_type}
                <br />
                Lat/Lon: {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
              </Popup>
            </CircleMarker>
          );
        })}

        {cameraClusterMode ? (
          <CircleMarker
            center={LUBELSKIE_CENTER}
            radius={16}
            pathOptions={{
              color: "#22364a",
              weight: 2,
              fillColor: "#3f73a8",
              fillOpacity: 0.94,
              className: "map-camera-cluster-dot",
            }}
            eventHandlers={{
              click: () => {
                setRequestedCenter(LUBELSKIE_CENTER);
                setRequestedZoom(CAMERA_CLUSTER_ZOOM_THRESHOLD + 1);
              },
            }}
          >
            <Tooltip permanent direction="center" offset={[0, 0]} opacity={1} className="map-camera-cluster-label">
              {String(CAMERA_FEEDS.length)}
            </Tooltip>
            <Popup>
              <strong>Skupisko kamer</strong>
              <br />
              Punktow: {CAMERA_FEEDS.length}
              <br />
              Kliknij marker, aby przyblizyc i zobaczyc pojedyncze kamerki.
            </Popup>
          </CircleMarker>
        ) : (
          CAMERA_FEEDS.map((camera) => (
            <CircleMarker
              key={camera.id}
              center={[camera.lat, camera.lon]}
              radius={11}
              pathOptions={{
                color: "#6d1111",
                weight: 2,
                fillColor: "#df5454",
                fillOpacity: 0.96,
                className: "map-camera-dot",
              }}
              eventHandlers={{
                click: () => onCameraSelect(camera),
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -10]} opacity={1} className="map-camera-label">
                {camera.label}
              </Tooltip>
              <Popup>
                <strong>{camera.label}</strong>
                <br />
                <span className={`map-camera-alert map-camera-alert--${camera.alertLevel}`}>
                  Alert: {camera.alertText}
                </span>
                <br />
                Lat/Lon: {camera.lat.toFixed(4)}, {camera.lon.toFixed(4)}
                <br />
                <a className="map-camera-link" href={camera.pageUrl} target="_blank" rel="noreferrer">
                  Odpal feed
                </a>
              </Popup>
            </CircleMarker>
          ))
        )}
      </MapContainer>

      {!globeMode ? (
        <div className="map-filter-wrap" ref={filterWrapRef}>
          {!isFilterPanelOpen ? (
            <button
              type="button"
              className="map-filter-toggle"
              aria-label="Pokaz filtry mapy"
              onClick={() => setIsFilterPanelOpen(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="map-filter-toggle-icon">
                <path d="M3 5h18v2l-7 7v4l-4 2v-6L3 7V5z" />
              </svg>
            </button>
          ) : (
            <aside className="map-filter-panel" aria-label="Filtr typow obiektow">
              <div className="map-filter-header">
                <h3>Typy obiektow</h3>
                <button
                  type="button"
                  className="map-filter-collapse"
                  onClick={() => setIsFilterPanelOpen(false)}
                >
                  Zwin
                </button>
              </div>
              <div className="map-filter-list">
                {availableNodeTypes.map((nodeType) => {
                  const enabled = visibleNodeTypes[nodeType] ?? true;
                  return (
                    <label key={nodeType} className={`map-filter-item${enabled ? " is-enabled" : ""}`}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => {
                          setVisibleNodeTypes((previous) => ({
                            ...previous,
                            [nodeType]: !(previous[nodeType] ?? true),
                          }));
                        }}
                      />
                      <span>{nodeType.replaceAll("_", " ")}</span>
                    </label>
                  );
                })}
              </div>
            </aside>
          )}
        </div>
      ) : null}

      <div className={`globe-overlay${globeMode ? " is-visible" : ""}`}>
        <div
          ref={globeWrapRef}
          className="globe-3d-wrap"
          role="img"
          aria-label="Teksturowany widok kuli ziemskiej"
        >
          <Globe
            key={globeInstanceKey}
            ref={globeRef}
            width={globeSize.width}
            height={globeSize.height}
            globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
            bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
            backgroundColor="rgba(0,0,0,0)"
            atmosphereColor="#94adc8"
            atmosphereAltitude={0.15}
            pointsData={globePoints}
            pointLat="lat"
            pointLng="lng"
            pointAltitude={0.01}
            pointRadius="size"
            pointColor="color"
            pointLabel={(point: any) => point.id as string}
            onPointClick={(point: any) => onNodeSelect(point.id as string)}
            arcsData={globeArcs}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcColor={() => ["#8ca6c2", "#d7e4f2"]}
            arcStroke={0.35}
            arcDashLength={0.3}
            arcDashGap={0.15}
            arcDashAnimateTime={3500}
            onGlobeReady={() => {
              const controls = globeRef.current?.controls?.();
              if (controls) {
                controls.enablePan = false;
                controls.enableZoom = false;
                controls.enableDamping = true;
                controls.dampingFactor = 0.08;
              }

              globeRef.current?.pointOfView(globeViewRef.current, 0);
            }}
          />
        </div>
        <div className="globe-footer">
          <p className="globe-hint">Tryb globalny: scroll up przybliza kule. Przy bardzo bliskim zoomie nastapi powrot do mapy.</p>
          <button type="button" className="globe-exit-btn" onClick={() => exitGlobeMode()}>
            Wroc do mapy
          </button>
        </div>
      </div>
    </div>
  );
}

function ZoomWatcher({
  onZoomChange,
  onCenterChange,
  requestedZoom,
  requestedCenter,
  onAppliedView,
}: {
  onZoomChange: (zoom: number) => void;
  onCenterChange: (center: [number, number]) => void;
  requestedZoom: number | null;
  requestedCenter: [number, number] | null;
  onAppliedView: () => void;
}) {
  const map = useMapEvents({
    zoomend: (event) => {
      onZoomChange(event.target.getZoom());
      const mapCenter = event.target.getCenter();
      onCenterChange([mapCenter.lat, mapCenter.lng]);
    },
    moveend: (event) => {
      const mapCenter = event.target.getCenter();
      onCenterChange([mapCenter.lat, mapCenter.lng]);
      onZoomChange(event.target.getZoom());
    },
  });

  useEffect(() => {
    const initialCenter = map.getCenter();
    onCenterChange([initialCenter.lat, initialCenter.lng]);
    onZoomChange(map.getZoom());
  }, [map, onCenterChange, onZoomChange]);

  useEffect(() => {
    if (requestedZoom === null && requestedCenter === null) {
      return;
    }

    const currentCenter = map.getCenter();
    const nextCenter = requestedCenter ?? ([currentCenter.lat, currentCenter.lng] as [number, number]);
    const nextZoom = requestedZoom ?? map.getZoom();

    map.flyTo(nextCenter, nextZoom, { animate: true, duration: 0.6 });
    onAppliedView();
  }, [map, onAppliedView, requestedCenter, requestedZoom]);

  return null;
}

function zoomToGlobeAltitude(zoom: number): number {
  // Lower map zoom means farther camera altitude on the globe.
  const normalized = clamp((zoom - 1) / 4, 0, 1);
  return clamp(DEFAULT_GLOBE_ALTITUDE - normalized * 0.8, MIN_GLOBE_ALTITUDE, MAX_GLOBE_ALTITUDE);
}

function globeAltitudeToMapZoom(altitude: number): number {
  // Keep return zoom in map mode and preserve rough visual continuity.
  if (altitude <= MAP_SWITCH_ALTITUDE) {
    return 3;
  }

  const normalized = clamp((DEFAULT_GLOBE_ALTITUDE - altitude) / 0.8, 0, 1);
  const zoom = 2 + normalized * 3;
  return clamp(Math.round(zoom), 3, 5);
}

function getCenter(points: GeoPoint[]): [number, number] {
  if (points.length === 0) {
    return LUBELSKIE_CENTER;
  }

  const latAvg = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lonAvg = points.reduce((sum, point) => sum + point.lon, 0) / points.length;
  return [latAvg, lonAvg];
}

function deriveMockCoord(seed: string): { lat: number; lon: number } {
  const hash = hashString(seed);
  const latOffset = ((hash % 1600) / 10000) - 0.08;
  const lonOffset = (((Math.floor(hash / 1600) % 1600) / 10000) - 0.08) * 1.4;
  const lat = LUBELSKIE_CENTER[0] + latOffset;
  const lon = LUBELSKIE_CENTER[1] + lonOffset;
  return { lat, lon };
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
