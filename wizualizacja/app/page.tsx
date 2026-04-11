'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, useCallback } from 'react';

import { BottomTicker } from '@/components/layout/BottomTicker';
import { SideNavBar } from '@/components/layout/SideNavBar';
import { TopNavBar } from '@/components/layout/TopNavBar';
import type { TopTab } from '@/components/layout/TopNavBar';

import { CameraDetailPanel } from '@/components/detail/CameraDetailPanel';
import { FloodHospitalsPanel } from '@/components/detail/FloodHospitalsPanel';
import { FloodOverviewCard } from '@/components/detail/FloodOverviewCard';
import { HospitalDetailPanel } from '@/components/detail/HospitalDetailPanel';
import { HospitalListPanel } from '@/components/detail/HospitalListPanel';
import { MiniStatsCard } from '@/components/detail/MiniStatsCard';

import { CrisisHeaderCard } from '@/components/panels/CrisisHeaderCard';
import { FilesPanel } from '@/components/panels/FilesPanel';
import { LayersPanel } from '@/components/panels/LayersPanel';
import { LivePanel } from '@/components/panels/LivePanel';
import { RiskPanel } from '@/components/panels/RiskPanel';
import { TerritorialFilterPanel } from '@/components/panels/TerritorialFilterPanel';

import { useTerritories } from '@/lib/useTerritories';
import { useHospitals, useHospitalStats } from '@/lib/useHospitals';
import type {
  ApiHospital,
  CameraFeed,
  LayerToggles,
  PanelId,
  TerritoryKind,
  VoiceAction
} from '@/lib/types';

const LubelskieMap = dynamic(() => import('@/components/map/LubelskieMap'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-variant">
      <span className="font-headline text-xs uppercase tracking-widest text-on-surface-variant">
        Ładowanie mapy...
      </span>
    </div>
  )
});

const DEFAULT_LAYERS: LayerToggles = {
  hospitals: true,
  floodZones: true,
  cameras: true,
  powiatBoundaries: true,
  gminaBoundaries: true
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TopTab>('map');
  const [activePanel, setActivePanel] = useState<PanelId | null>('map');
  const [territoryLevel, setTerritoryLevel] = useState<TerritoryKind>('powiat');
  const [selectedPowiatId, setSelectedPowiatId] = useState<string | null>(null);
  const [selectedGminaId, setSelectedGminaId] = useState<string | null>(null);
  const [layerToggles, setLayerToggles] =
    useState<LayerToggles>(DEFAULT_LAYERS);
  const [selectedCamera, setSelectedCamera] = useState<CameraFeed | null>(null);
  const [selectedHospital, setSelectedHospital] = useState<ApiHospital | null>(
    null
  );

  const territories = useTerritories();
  const { hospitals, loading: hospitalsLoading } = useHospitals();
  const { stats } = useHospitalStats();

  // Build search index from territories for TopNavBar
  const searchIndex = useMemo(() => {
    const powiatFeatures = territories.powiaty?.features ?? [];
    const gminaFeatures = territories.gminy?.features ?? [];

    const powiatNameByTeryt = new Map<string, string>();
    for (const p of powiatFeatures) {
      const t = p.properties.teryt;
      if (t) powiatNameByTeryt.set(t.slice(0, 4), p.properties.name);
    }

    const items: Array<{
      id: string;
      name: string;
      kind: 'powiat' | 'gmina';
      parentName?: string;
    }> = [];
    for (const p of powiatFeatures) {
      items.push({
        id: p.properties.id,
        name: p.properties.name,
        kind: 'powiat'
      });
    }
    for (const g of gminaFeatures) {
      const t = g.properties.teryt;
      const parent = t ? powiatNameByTeryt.get(t.slice(0, 4)) : undefined;
      items.push({
        id: g.properties.id,
        name: g.properties.name,
        kind: 'gmina',
        parentName: parent
      });
    }
    return items;
  }, [territories.powiaty, territories.gminy]);

  const handleSearchSelect = useCallback(
    (result: { id: string; kind: 'powiat' | 'gmina' }) => {
      if (result.kind === 'powiat') {
        setTerritoryLevel('powiat');
        setSelectedGminaId(null);
        setSelectedPowiatId(result.id);
      } else {
        setTerritoryLevel('gmina');
        setSelectedPowiatId(null);
        setSelectedGminaId(result.id);
      }
    },
    []
  );

  function handleSidebarClick(panel: PanelId) {
    setActivePanel(current => (current === panel ? null : panel));
  }

  function toggleLayer(key: keyof LayerToggles) {
    setLayerToggles(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function closePanel() {
    setActivePanel(null);
  }

  const handleVoiceAction = useCallback(
    (action: VoiceAction) => {
      switch (action.action) {
        case 'switch_tab':
          if (action.tab) setActiveTab(action.tab);
          break;
        case 'open_panel':
          if (action.panel) setActivePanel(action.panel);
          break;
        case 'close_panel':
          setActivePanel(null);
          break;
        case 'search_territory':
          if (action.territory_name) {
            const q = action.territory_name.toLowerCase();
            const match = searchIndex.find(item => {
              const n = item.name.toLowerCase();
              return n.includes(q) || q.includes(n);
            });
            if (match) handleSearchSelect({ id: match.id, kind: match.kind });
          }
          break;
        case 'toggle_layer':
          if (action.layer) {
            const layer = action.layer as keyof LayerToggles;
            setLayerToggles(prev => ({
              ...prev,
              [layer]: action.layer_enabled ?? !prev[layer],
            }));
          }
          break;
        case 'info':
          // No state change – audio confirmation only
          break;
      }
    },
    [searchIndex, handleSearchSelect]
  );

  return (
    <div className="relative h-screen w-full overflow-hidden bg-surface text-on-surface">
      <TopNavBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchIndex={searchIndex}
        onSelectSearchResult={handleSearchSelect}
        onVoiceAction={handleVoiceAction}
      />
      <SideNavBar activePanel={activePanel} onSelect={handleSidebarClick} />

      {/* Floating left panel stack – shared across all tabs */}
      <div className="pointer-events-none fixed left-[84px] top-20 z-40 flex max-h-[calc(100vh-10rem)] w-80 flex-col gap-4 overflow-y-auto pr-1 no-scrollbar">
        {activeTab === 'map' && (
          <div className="pointer-events-auto">
            <CrisisHeaderCard />
          </div>
        )}

        {activePanel === 'map' && (
          <div className="pointer-events-auto">
            <TerritorialFilterPanel
              powiaty={territories.powiaty}
              gminy={territories.gminy}
              loading={territories.status === 'loading'}
              selectedPowiatId={selectedPowiatId}
              selectedGminaId={selectedGminaId}
              onSelectPowiat={setSelectedPowiatId}
              onSelectGmina={setSelectedGminaId}
              onLevelChange={setTerritoryLevel}
              level={territoryLevel}
              onClose={closePanel}
            />
          </div>
        )}

        {activePanel === 'live' && (
          <div className="pointer-events-auto">
            <LivePanel
              onSelectCamera={camera => setSelectedCamera(camera)}
              onClose={closePanel}
            />
          </div>
        )}

        {activePanel === 'layers' && (
          <div className="pointer-events-auto">
            <LayersPanel
              toggles={layerToggles}
              onToggle={toggleLayer}
              onClose={closePanel}
            />
          </div>
        )}

        {activePanel === 'risk' && (
          <div className="pointer-events-auto">
            <RiskPanel onClose={closePanel} />
          </div>
        )}

        {activePanel === 'files' && (
          <div className="pointer-events-auto">
            <FilesPanel onClose={closePanel} />
          </div>
        )}
      </div>

      {activeTab === 'map' && (
        <>
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
              onSelectCamera={camera => {
                setSelectedCamera(camera);
                setSelectedHospital(null);
              }}
              hospitals={hospitals}
              onSelectHospital={hospital => {
                setSelectedHospital(hospital);
                setSelectedCamera(null);
              }}
              onDeselectHospital={() => setSelectedHospital(null)}
              selectedHospital={selectedHospital}
            />
          </div>

          {/* Right detail column */}
          <main className="pointer-events-none relative z-10 flex h-full justify-end pl-24 pr-6 pt-20">
            <section className="pointer-events-auto flex w-[420px] flex-col gap-4 overflow-y-auto py-4 no-scrollbar max-h-[calc(100vh-6rem)]">
              {selectedCamera && (
                <CameraDetailPanel
                  camera={selectedCamera}
                  onClose={() => setSelectedCamera(null)}
                />
              )}
              {selectedHospital && (
                <HospitalDetailPanel
                  hospital={selectedHospital}
                  onClose={() => setSelectedHospital(null)}
                />
              )}
              {!selectedCamera && !selectedHospital && (
                <FloodHospitalsPanel onClose={() => {}} />
              )}
              <FloodOverviewCard />
              <MiniStatsCard
                value={stats ? String(stats.hospitals) : '—'}
                label="Szpitale w systemie"
                caption={
                  stats
                    ? `${stats.departments} oddziałów monitorowanych`
                    : 'Ładowanie...'
                }
              />
            </section>
          </main>

          <BottomTicker />
        </>
      )}

      {activeTab === 'hospitals' && (
        <div className="fixed inset-0 top-16 z-10 flex bg-surface">
          {/* Left sidebar spacer */}
          <div className="w-[72px] shrink-0" />

          {/* Hospital list */}
          <div className="flex w-[480px] shrink-0 flex-col border-r border-outline bg-white">
            <HospitalListPanel
              hospitals={hospitals}
              loading={hospitalsLoading}
              onSelectHospital={hospital => {
                setSelectedHospital(hospital);
              }}
            />
          </div>

          {/* Map + detail side */}
          <div className="relative flex-1">
            <LubelskieMap
              powiaty={territories.powiaty}
              gminy={territories.gminy}
              level={territoryLevel}
              selectedPowiatId={selectedPowiatId}
              selectedGminaId={selectedGminaId}
              onSelectPowiat={setSelectedPowiatId}
              onSelectGmina={setSelectedGminaId}
              layerToggles={layerToggles}
              onSelectCamera={camera => {
                setSelectedCamera(camera);
                setSelectedHospital(null);
              }}
              hospitals={hospitals}
              onSelectHospital={hospital => {
                setSelectedHospital(hospital);
                setSelectedCamera(null);
              }}
              onDeselectHospital={() => setSelectedHospital(null)}
              selectedHospital={selectedHospital}
            />

            {/* Detail overlay */}
            {selectedHospital && (
              <div className="pointer-events-auto absolute right-4 top-4 z-20 w-[400px]">
                <HospitalDetailPanel
                  hospital={selectedHospital}
                  onClose={() => setSelectedHospital(null)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
