"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { BottomTicker } from "@/components/layout/BottomTicker";
import { SideNavBar } from "@/components/layout/SideNavBar";
import { TopNavBar } from "@/components/layout/TopNavBar";

import { AssetDetailPanel } from "@/components/detail/AssetDetailPanel";
import { CameraDetailPanel } from "@/components/detail/CameraDetailPanel";
import { MiniStatsCard } from "@/components/detail/MiniStatsCard";

import { CrisisHeaderCard } from "@/components/panels/CrisisHeaderCard";
import { FilesPanel } from "@/components/panels/FilesPanel";
import { LayersPanel } from "@/components/panels/LayersPanel";
import { LivePanel } from "@/components/panels/LivePanel";
import { MapPanel } from "@/components/panels/MapPanel";
import { RiskPanel } from "@/components/panels/RiskPanel";
import { TerritorialFilterPanel } from "@/components/panels/TerritorialFilterPanel";

import { useTerritories } from "@/lib/useTerritories";
import type {
  CameraFeed,
  LayerToggles,
  PanelId,
  TerritoryKind,
} from "@/lib/types";

const LubelskieMap = dynamic(() => import("@/components/map/LubelskieMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-variant">
      <span className="font-headline text-xs uppercase tracking-widest text-on-surface-variant">
        Ładowanie mapy...
      </span>
    </div>
  ),
});

const DEFAULT_LAYERS: LayerToggles = {
  hospitals: true,
  floodZones: true,
  cameras: true,
  powiatBoundaries: true,
  gminaBoundaries: true,
};

export default function HomePage() {
  const [activePanel, setActivePanel] = useState<PanelId | null>("map");
  const [territoryLevel, setTerritoryLevel] = useState<TerritoryKind>("powiat");
  const [selectedPowiatId, setSelectedPowiatId] = useState<string | null>(null);
  const [selectedGminaId, setSelectedGminaId] = useState<string | null>(null);
  const [layerToggles, setLayerToggles] = useState<LayerToggles>(DEFAULT_LAYERS);
  const [selectedCamera, setSelectedCamera] = useState<CameraFeed | null>(null);
  const [assetDetailOpen, setAssetDetailOpen] = useState(true);

  const territories = useTerritories();

  function handleSidebarClick(panel: PanelId) {
    setActivePanel((current) => (current === panel ? null : panel));
  }

  function toggleLayer(key: keyof LayerToggles) {
    setLayerToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function closePanel() {
    setActivePanel(null);
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-surface text-on-surface">
      <TopNavBar />
      <SideNavBar activePanel={activePanel} onSelect={handleSidebarClick} />

      {/* Map background */}
      <div className="absolute inset-0 top-16 z-0 bg-grid">
        <LubelskieMap
          powiaty={territories.powiaty}
          gminy={territories.gminy}
          level={territoryLevel}
          selectedPowiatId={selectedPowiatId}
          selectedGminaId={selectedGminaId}
          onSelectPowiat={setSelectedPowiatId}
          onSelectGmina={setSelectedGminaId}
          layerToggles={layerToggles}
          onSelectCamera={(camera) => {
            setSelectedCamera(camera);
          }}
        />
      </div>

      {/* Floating left panel stack */}
      <div className="pointer-events-none fixed left-[84px] top-20 z-40 flex max-h-[calc(100vh-10rem)] w-80 flex-col gap-4 overflow-y-auto pr-1 no-scrollbar">
        <div className="pointer-events-auto">
          <CrisisHeaderCard />
        </div>

        {activePanel === "map" && (
          <>
            <div className="pointer-events-auto">
              <MapPanel
                level={territoryLevel}
                onLevelChange={setTerritoryLevel}
                powiatCount={territories.powiaty?.features.length ?? 0}
                gminaCount={territories.gminy?.features.length ?? 0}
                onClose={closePanel}
              />
            </div>
            <div className="pointer-events-auto">
              <TerritorialFilterPanel
                powiaty={territories.powiaty}
                gminy={territories.gminy}
                loading={territories.status === "loading"}
                selectedPowiatId={selectedPowiatId}
                selectedGminaId={selectedGminaId}
                onSelectPowiat={setSelectedPowiatId}
                onSelectGmina={setSelectedGminaId}
                onLevelChange={setTerritoryLevel}
                level={territoryLevel}
                onClose={closePanel}
              />
            </div>
          </>
        )}

        {activePanel === "live" && (
          <div className="pointer-events-auto">
            <LivePanel
              onSelectCamera={(camera) => setSelectedCamera(camera)}
              onClose={closePanel}
            />
          </div>
        )}

        {activePanel === "layers" && (
          <div className="pointer-events-auto">
            <LayersPanel
              toggles={layerToggles}
              onToggle={toggleLayer}
              onClose={closePanel}
            />
          </div>
        )}

        {activePanel === "risk" && (
          <div className="pointer-events-auto">
            <RiskPanel onClose={closePanel} />
          </div>
        )}

        {activePanel === "files" && (
          <div className="pointer-events-auto">
            <FilesPanel onClose={closePanel} />
          </div>
        )}
      </div>

      {/* Right detail column */}
      <main className="pointer-events-none relative z-10 flex h-full justify-end pl-24 pr-6 pt-20">
        <section className="pointer-events-auto flex w-[420px] flex-col gap-4 py-4">
          {selectedCamera && (
            <CameraDetailPanel
              camera={selectedCamera}
              onClose={() => setSelectedCamera(null)}
            />
          )}
          {assetDetailOpen && !selectedCamera && (
            <AssetDetailPanel onClose={() => setAssetDetailOpen(false)} />
          )}
          <MiniStatsCard
            value="42"
            label="Aktywne incydenty"
            caption="Zasięg sektora 4-Alpha"
          />
        </section>
      </main>

      <BottomTicker />
    </div>
  );
}
