'use client';

import { useMemo, useState } from 'react';
import type {
  TerritoryFeature,
  TerritoryFeatureCollection,
  TerritoryKind
} from '@/lib/types';
import { PanelShell } from './PanelShell';

type Props = {
  powiaty: TerritoryFeatureCollection | null;
  gminy: TerritoryFeatureCollection | null;
  loading: boolean;
  selectedPowiatId: string | null;
  selectedGminaId: string | null;
  onSelectPowiat: (id: string | null) => void;
  onSelectGmina: (id: string | null) => void;
  onLevelChange: (level: TerritoryKind) => void;
  level: TerritoryKind;
  onClose: () => void;
};

function featureMatchesPowiat(
  gmina: TerritoryFeature,
  powiatName: string
): boolean {
  const teryt = gmina.properties.teryt;
  // Gmina TERYT codes start with the powiat TERYT (first 4 chars).
  if (!teryt) return false;
  return teryt.slice(0, 4) === powiatName.slice(0, 4);
}

export function TerritorialFilterPanel({
  powiaty,
  gminy,
  loading,
  selectedPowiatId,
  selectedGminaId,
  onSelectPowiat,
  onSelectGmina,
  onLevelChange,
  level,
  onClose
}: Props) {
  const [expandedPowiaty, setExpandedPowiaty] = useState<Set<string>>(
    new Set()
  );

  const powiatFeatures = powiaty?.features ?? [];
  const gminaFeatures = gminy?.features ?? [];

  const gminyByPowiatTeryt = useMemo(() => {
    const map = new Map<string, TerritoryFeature[]>();
    for (const gmina of gminaFeatures) {
      const teryt = gmina.properties.teryt;
      if (!teryt) continue;
      const powiatTeryt = teryt.slice(0, 4);
      if (!map.has(powiatTeryt)) map.set(powiatTeryt, []);
      map.get(powiatTeryt)!.push(gmina);
    }
    return map;
  }, [gminaFeatures]);

  function toggleExpanded(id: string) {
    setExpandedPowiaty(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <PanelShell
      title="Widok mapy"
      onClose={onClose}
      meta={
        <div className="flex items-center gap-1 rounded bg-surface-variant p-0.5">
          <button
            type="button"
            onClick={() => onLevelChange('powiat')}
            className={
              level === 'powiat'
                ? 'rounded bg-white px-2 py-0.5 font-headline text-[9px] font-bold uppercase tracking-wider text-primary-dark shadow-sm'
                : 'px-2 py-0.5 font-headline text-[9px] font-bold uppercase tracking-wider text-on-surface-variant'
            }
          >
            Powiaty ({powiatFeatures.length})
          </button>
          <button
            type="button"
            onClick={() => onLevelChange('gmina')}
            className={
              level === 'gmina'
                ? 'rounded bg-white px-2 py-0.5 font-headline text-[9px] font-bold uppercase tracking-wider text-primary-dark shadow-sm'
                : 'px-2 py-0.5 font-headline text-[9px] font-bold uppercase tracking-wider text-on-surface-variant'
            }
          >
            Gminy ({gminaFeatures.length})
          </button>
        </div>
      }
    >
      <div className="rounded border border-outline bg-surface-variant/50 p-3 mb-3">
        <p className="font-headline text-[11px] leading-relaxed text-on-surface-variant">
          Kliknij na wybranym obszarze, aby przybliżyć widok. Użyj filtra
          terytorialnego poniżej, aby wybrać konkretny powiat lub gminę z
          rozwijanego drzewka.
        </p>
      </div>

      {loading && (
        <div className="px-2 py-4 font-headline text-xs text-on-surface-variant">
          Ładowanie granic...
        </div>
      )}

      {!loading && powiatFeatures.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              onSelectPowiat(null);
              onSelectGmina(null);
            }}
            className="flex items-center gap-2 rounded bg-surface-variant px-2 py-1.5 text-left transition-colors hover:bg-outline"
          >
            <span className="material-symbols-outlined text-sm text-primary-dark">
              public
            </span>
            <span className="font-headline text-sm font-medium">
              Lubelskie (całość)
            </span>
          </button>

          <div className="flex max-h-[42vh] flex-col gap-0.5 overflow-y-auto pl-2 pr-1 no-scrollbar">
            {powiatFeatures.map(powiat => {
              const id = powiat.properties.id;
              const teryt = powiat.properties.teryt ?? '';
              const expanded = expandedPowiaty.has(id);
              const selected = selectedPowiatId === id;
              const children = gminyByPowiatTeryt.get(teryt.slice(0, 4)) ?? [];

              return (
                <div key={id}>
                  <div
                    className={
                      selected
                        ? 'flex items-center justify-between rounded bg-primary/10 px-2 py-1.5 transition-colors'
                        : 'group flex items-center justify-between rounded px-2 py-1.5 transition-colors hover:bg-surface-variant'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpanded(id)}
                      className="flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-sm text-on-surface-variant">
                        {expanded ? 'expand_more' : 'chevron_right'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPowiat(selected ? null : id);
                        onSelectGmina(null);
                      }}
                      className="flex-1 text-left"
                    >
                      <span
                        className={
                          selected
                            ? 'font-headline text-xs font-semibold text-primary-dark'
                            : 'font-headline text-xs text-on-surface-variant group-hover:text-on-surface'
                        }
                      >
                        {powiat.properties.name}
                      </span>
                    </button>
                  </div>

                  {expanded && children.length > 0 && (
                    <div className="ml-5 flex flex-col gap-0.5 border-l border-outline py-0.5 pl-2">
                      {children.map(gmina => {
                        const gid = gmina.properties.id;
                        const gselected = selectedGminaId === gid;
                        return (
                          <button
                            type="button"
                            key={gid}
                            onClick={() => {
                              onSelectGmina(gselected ? null : gid);
                              onSelectPowiat(null);
                            }}
                            className={
                              gselected
                                ? 'rounded bg-primary/10 px-2 py-1 text-left font-headline text-[11px] font-semibold text-primary-dark'
                                : 'rounded px-2 py-1 text-left font-headline text-[11px] text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                            }
                          >
                            {gmina.properties.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PanelShell>
  );
}
