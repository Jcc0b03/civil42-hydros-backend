"use client";

import { useEffect, useMemo, useRef } from "react";
import type { FeatureGroup as LeafletFeatureGroup, LatLngBoundsExpression } from "leaflet";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  WMSTileLayer,
  useMap,
} from "react-leaflet";

import {
  CAMERA_CLUSTER_ZOOM_THRESHOLD,
  CAMERA_FEEDS,
  LUBELSKIE_CENTER,
  LUBELSKIE_INITIAL_ZOOM,
} from "@/lib/constants";
import type {
  CameraFeed,
  LayerToggles,
  TerritoryFeature,
  TerritoryFeatureCollection,
  TerritoryKind,
} from "@/lib/types";

type Props = {
  powiaty: TerritoryFeatureCollection | null;
  gminy: TerritoryFeatureCollection | null;
  level: TerritoryKind;
  selectedPowiatId: string | null;
  selectedGminaId: string | null;
  onSelectPowiat: (id: string | null) => void;
  onSelectGmina: (id: string | null) => void;
  layerToggles: LayerToggles;
  onSelectCamera: (camera: CameraFeed) => void;
};

const BASE_STYLE = {
  color: "#2d6c00",
  weight: 1.2,
  opacity: 0.75,
  fillColor: "#72bf44",
  fillOpacity: 0.06,
};

const HOVER_STYLE = {
  color: "#2d6c00",
  weight: 2.2,
  opacity: 1,
  fillColor: "#72bf44",
  fillOpacity: 0.18,
};

const SELECTED_STYLE = {
  color: "#bb0013",
  weight: 2.6,
  opacity: 1,
  fillColor: "#ed1c24",
  fillOpacity: 0.18,
};

export default function LubelskieMap({
  powiaty,
  gminy,
  level,
  selectedPowiatId,
  selectedGminaId,
  onSelectPowiat,
  onSelectGmina,
  layerToggles,
  onSelectCamera,
}: Props) {
  const powiatLayerRef = useRef<LeafletFeatureGroup | null>(null);
  const gminaLayerRef = useRef<LeafletFeatureGroup | null>(null);

  const showPowiaty = layerToggles.powiatBoundaries && level === "powiat" && !!powiaty;
  const showGminy = layerToggles.gminaBoundaries && level === "gmina" && !!gminy;

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={LUBELSKIE_CENTER}
        zoom={LUBELSKIE_INITIAL_ZOOM}
        minZoom={7}
        maxZoom={18}
        zoomControl={false}
        scrollWheelZoom
        className="h-full w-full bg-[#f8f9fa]"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />

        <FitToFeatures
          powiaty={powiaty}
          gminy={gminy}
          selectedPowiatId={selectedPowiatId}
          selectedGminaId={selectedGminaId}
        />

        {showPowiaty && (
          <GeoJSON
            key={`powiaty-${selectedPowiatId ?? "none"}`}
            data={powiaty as unknown as GeoJSON.FeatureCollection}
            ref={(ref) => {
              powiatLayerRef.current = ref as unknown as LeafletFeatureGroup;
            }}
            style={(feature) => {
              const props = (feature as TerritoryFeature).properties;
              return props.id === selectedPowiatId ? SELECTED_STYLE : BASE_STYLE;
            }}
            onEachFeature={(feature, layer) => {
              const props = (feature as TerritoryFeature).properties;
              layer.bindTooltip(props.name, {
                className: "powiat-label",
                direction: "center",
                sticky: false,
                permanent: false,
              });
              layer.on({
                mouseover: (e) => {
                  if (props.id !== selectedPowiatId) {
                    (e.target as any).setStyle(HOVER_STYLE);
                  }
                },
                mouseout: (e) => {
                  if (props.id !== selectedPowiatId) {
                    (e.target as any).setStyle(BASE_STYLE);
                  }
                },
                click: () => onSelectPowiat(props.id),
              });
            }}
          />
        )}

        {showGminy && (
          <GeoJSON
            key={`gminy-${selectedGminaId ?? "none"}`}
            data={gminy as unknown as GeoJSON.FeatureCollection}
            ref={(ref) => {
              gminaLayerRef.current = ref as unknown as LeafletFeatureGroup;
            }}
            style={(feature) => {
              const props = (feature as TerritoryFeature).properties;
              return props.id === selectedGminaId ? SELECTED_STYLE : BASE_STYLE;
            }}
            onEachFeature={(feature, layer) => {
              const props = (feature as TerritoryFeature).properties;
              layer.bindTooltip(props.name, {
                className: "gmina-label",
                direction: "center",
                sticky: false,
                permanent: false,
              });
              layer.on({
                mouseover: (e) => {
                  if (props.id !== selectedGminaId) {
                    (e.target as any).setStyle(HOVER_STYLE);
                  }
                },
                mouseout: (e) => {
                  if (props.id !== selectedGminaId) {
                    (e.target as any).setStyle(BASE_STYLE);
                  }
                },
                click: () => onSelectGmina(props.id),
              });
            }}
          />
        )}

        {layerToggles.cameras && (
          <CameraLayer onSelectCamera={onSelectCamera} />
        )}

        {layerToggles.floodZones && (
          <WMSTileLayer
            url="https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS"
            layers="MZP_RZEKI_P100"
            format="image/png"
            transparent
            opacity={0.45}
            attribution="Dane: Wody Polskie (ISOK)"
          />
        )}
      </MapContainer>
    </div>
  );
}

function CameraLayer({ onSelectCamera }: { onSelectCamera: (camera: CameraFeed) => void }) {
  const map = useMap();
  const zoom = map.getZoom();
  const clustered = zoom < CAMERA_CLUSTER_ZOOM_THRESHOLD;

  const clusterCenter = useMemo<[number, number]>(() => {
    const lat = CAMERA_FEEDS.reduce((sum, c) => sum + c.lat, 0) / CAMERA_FEEDS.length;
    const lon = CAMERA_FEEDS.reduce((sum, c) => sum + c.lon, 0) / CAMERA_FEEDS.length;
    return [lat, lon];
  }, []);

  if (clustered) {
    return (
      <CircleMarker
        center={clusterCenter}
        radius={16}
        pathOptions={{
          color: "#6d1111",
          weight: 2,
          fillColor: "#df5454",
          fillOpacity: 0.94,
        }}
        eventHandlers={{
          click: () => map.flyTo(clusterCenter, CAMERA_CLUSTER_ZOOM_THRESHOLD + 1),
        }}
      >
        <Tooltip
          permanent
          direction="center"
          offset={[0, 0]}
          opacity={1}
          className="map-camera-cluster-label"
        >
          {String(CAMERA_FEEDS.length)}
        </Tooltip>
      </CircleMarker>
    );
  }

  return (
    <>
      {CAMERA_FEEDS.map((camera) => (
        <CircleMarker
          key={camera.id}
          center={[camera.lat, camera.lon]}
          radius={10}
          pathOptions={{
            color: "#6d1111",
            weight: 2,
            fillColor: "#df5454",
            fillOpacity: 0.95,
          }}
          eventHandlers={{
            click: () => onSelectCamera(camera),
          }}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -10]}
            opacity={1}
            className="map-camera-label"
          >
            {camera.label}
          </Tooltip>
          <Popup>
            <strong>{camera.label}</strong>
            <br />
            Alert: {camera.alertText}
            <br />
            <button
              type="button"
              className="mt-1 font-semibold text-primary-dark underline"
              onClick={() => onSelectCamera(camera)}
            >
              Otwórz feed
            </button>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

function FitToFeatures({
  powiaty,
  gminy,
  selectedPowiatId,
  selectedGminaId,
}: {
  powiaty: TerritoryFeatureCollection | null;
  gminy: TerritoryFeatureCollection | null;
  selectedPowiatId: string | null;
  selectedGminaId: string | null;
}) {
  const map = useMap();
  const initialized = useRef(false);

  useEffect(() => {
    if (!powiaty || initialized.current) return;
    const bounds = featureCollectionBounds(powiaty);
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40] });
      initialized.current = true;
    }
  }, [map, powiaty]);

  useEffect(() => {
    if (!selectedPowiatId || !powiaty) return;
    const feature = powiaty.features.find((f) => f.properties.id === selectedPowiatId);
    if (!feature) return;
    const bounds = featureBounds(feature);
    if (bounds) map.flyToBounds(bounds, { padding: [80, 80], duration: 0.6 });
  }, [map, powiaty, selectedPowiatId]);

  useEffect(() => {
    if (!selectedGminaId || !gminy) return;
    const feature = gminy.features.find((f) => f.properties.id === selectedGminaId);
    if (!feature) return;
    const bounds = featureBounds(feature);
    if (bounds) map.flyToBounds(bounds, { padding: [100, 100], duration: 0.6 });
  }, [map, gminy, selectedGminaId]);

  return null;
}

function featureCollectionBounds(
  fc: TerritoryFeatureCollection,
): LatLngBoundsExpression | null {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const feature of fc.features) {
    const b = featureBounds(feature);
    if (!b) continue;
    const [sw, ne] = b as [[number, number], [number, number]];
    minLat = Math.min(minLat, sw[0]);
    minLon = Math.min(minLon, sw[1]);
    maxLat = Math.max(maxLat, ne[0]);
    maxLon = Math.max(maxLon, ne[1]);
  }
  if (!Number.isFinite(minLat)) return null;
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

function featureBounds(feature: TerritoryFeature): LatLngBoundsExpression | null {
  const coords = collectCoords(feature.geometry);
  if (coords.length === 0) return null;
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const [lon, lat] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

function collectCoords(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): Array<[number, number]> {
  if (geom.type === "Polygon") {
    return geom.coordinates.flat() as Array<[number, number]>;
  }
  return geom.coordinates.flat(2) as Array<[number, number]>;
}
