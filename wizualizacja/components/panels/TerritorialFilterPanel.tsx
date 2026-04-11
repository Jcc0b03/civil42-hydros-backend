'use client';

import { useMemo, useState, useCallback } from 'react';
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

type SearchResult = {
  id: string;
  name: string;
  kind: TerritoryKind;
  parentName?: string;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/\u0141/g, 'l');
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
  const [query, setQuery] = useState('');
  const [expandedPowiaty, setExpandedPowiaty] = useState<Set<string>>(
    new Set()
  );

  const powiatFeatures = powiaty?.features ?? [];
  const gminaFeatures = gminy?.features ?? [];

  // Index for powiat name lookup by TERYT prefix
  const powiatNameByTeryt = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of powiatFeatures) {
      const t = p.properties.teryt;
      if (t) map.set(t.slice(0, 4), p.properties.name);
    }
    return map;
  }, [powiatFeatures]);

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

  // Build flat search index: all powiaty + all gminy
  const searchIndex = useMemo<SearchResult[]>(() => {
    const items: SearchResult[] = [];
    for (const p of powiatFeatures) {
      items.push({
        id: p.properties.id,
        name: p.properties.name,
        kind: 'powiat',
      });
    }
    for (const g of gminaFeatures) {
      const t = g.properties.teryt;
      const parent = t ? powiatNameByTeryt.get(t.slice(0, 4)) : undefined;
      items.push({
        id: g.properties.id,
        name: g.properties.name,
        kind: 'gmina',
        parentName: parent,
      });
    }
    return items;
  }, [powiatFeatures, gminaFeatures, powiatNameByTeryt]);

  // Filtered search results
  const searchResults = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    return searchIndex.filter(item => normalize(item.name).includes(q)).slice(0, 15);
  }, [query, searchIndex]);

  const hasSearch = query.trim().length >= 2;

  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      setQuery('');
      if (result.kind === 'powiat') {
        onLevelChange('powiat');
        onSelectGmina(null);
        onSelectPowiat(result.id);
      } else {
        onLevelChange('gmina');
        onSelectPowiat(null);
        onSelectGmina(result.id);
      }
    },
    [onLevelChange, onSelectPowiat, onSelectGmina]
  );

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
      title="Sektory"
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
            Powiaty
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
            Gminy
          </button>
        </div>
      }
    >
      {/* ── Search input ── */}
      <div className="relative mb-3">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-primary-dark">
          search
        </span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Szukaj sektor (powiat / gmina)…"
          className="w-full rounded-lg border-2 border-primary/40 bg-white py-2.5 pl-10 pr-9 font-headline text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-base text-on-surface-variant hover:text-critical"
          >
            close
          </button>
        )}
      </div>

      {/* ── Search results dropdown ── */}
      {hasSearch && (
        <div className="mb-3 flex max-h-52 flex-col gap-0.5 overflow-y-auto rounded-lg border border-primary/30 bg-white p-1 shadow-lg">
          {searchResults.length === 0 && (
            <div className="px-3 py-4 text-center font-headline text-xs text-on-surface-variant">
              Brak wyników dla „{query}"
            </div>
          )}
          {searchResults.map(result => (
            <button
              type="button"
              key={`${result.kind}-${result.id}`}
              onClick={() => handleSelectResult(result)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-primary/10"
            >
              <span className="material-symbols-outlined text-base text-primary-dark">
                {result.kind === 'powiat' ? 'location_city' : 'pin_drop'}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate font-headline text-xs font-semibold text-on-surface">
                  {result.name}
                </span>
                <span className="font-headline text-[10px] text-on-surface-variant">
                  {result.kind === 'powiat' ? 'Powiat' : `Gmina · pow. ${result.parentName ?? '—'}`}
                </span>
              </div>
              <span className="material-symbols-outlined text-sm text-on-surface-variant">
                arrow_forward
              </span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="px-2 py-4 font-headline text-xs text-on-surface-variant">
          Ładowanie granic...
        </div>
      )}

      {/* ── Tree list (only when not actively searching) ── */}
      {!loading && !hasSearch && powiatFeatures.length > 0 && (
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
                        onLevelChange('powiat');
                        onSelectGmina(null);
                        onSelectPowiat(selected ? null : id);
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
                              onLevelChange('gmina');
                              onSelectPowiat(null);
                              onSelectGmina(gselected ? null : gid);
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
