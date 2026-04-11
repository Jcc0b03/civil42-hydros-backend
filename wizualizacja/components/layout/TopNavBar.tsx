'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { VoiceController } from '@/components/voice/VoiceController';
import type { VoiceAction } from '@/lib/types';

export type TopTab = 'map' | 'hospitals';

type SearchResult = {
  id: string;
  name: string;
  kind: 'powiat' | 'gmina';
  parentName?: string;
};

const NAV_ITEMS: Array<{ id: TopTab; label: string }> = [
  { id: 'map', label: 'Przegląd regionalny' },
  { id: 'hospitals', label: 'Szpitale' }
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/\u0141/g, 'l');
}

type Props = {
  activeTab?: TopTab;
  onTabChange?: (tab: TopTab) => void;
  searchIndex?: SearchResult[];
  onSelectSearchResult?: (result: SearchResult) => void;
  onVoiceAction?: (action: VoiceAction) => void;
};

export function TopNavBar({
  activeTab = 'map',
  onTabChange,
  searchIndex = [],
  onSelectSearchResult,
  onVoiceAction
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const searchResults = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    return searchIndex
      .filter(item => normalize(item.name).includes(q))
      .slice(0, 12);
  }, [query, searchIndex]);

  const hasResults = query.trim().length >= 2;

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setQuery('');
      setOpen(false);
      onSelectSearchResult?.(result);
    },
    [onSelectSearchResult]
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline bg-surface-variant px-8">
      <div className="flex items-center gap-8">
        <span className="font-headline text-lg font-bold uppercase tracking-tight text-primary-dark">
          Centrum Dowodzenia
        </span>
        <nav className="hidden h-full items-center gap-6 pt-1 md:flex">
          {NAV_ITEMS.map(item => (
            <button
              type="button"
              key={item.id}
              onClick={() => onTabChange?.(item.id)}
              className={
                activeTab === item.id
                  ? 'border-b-2 border-primary-dark pb-1 font-headline text-sm font-bold tracking-tight text-primary-dark'
                  : 'rounded px-2 py-1 font-headline text-sm tracking-tight text-on-surface/70 transition-colors hover:bg-outline'
              }
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {/* ── Main search ── */}
        <div ref={wrapperRef} className="relative">
          <div className="flex items-center rounded-lg border-2 border-primary/30 bg-white px-3 py-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <span className="material-symbols-outlined mr-2 text-base text-primary-dark">
              search
            </span>
            <input
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Szukaj sektor (powiat / gmina)…"
              className="w-56 border-none bg-transparent font-headline text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-0 lg:w-72"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setOpen(false);
                }}
                className="material-symbols-outlined text-sm text-on-surface-variant hover:text-critical"
              >
                close
              </button>
            )}
          </div>

          {/* Dropdown results */}
          {open && hasResults && (
            <div className="absolute right-0 top-full mt-1 w-80 max-h-72 overflow-y-auto rounded-lg border border-outline bg-white p-1 shadow-2xl">
              {searchResults.length === 0 ? (
                <div className="px-3 py-4 text-center font-headline text-xs text-on-surface-variant">
                  Brak wyników dla „{query}"
                </div>
              ) : (
                searchResults.map(result => (
                  <button
                    type="button"
                    key={`${result.kind}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-primary/10"
                  >
                    <span className="material-symbols-outlined text-base text-primary-dark">
                      {result.kind === 'powiat'
                        ? 'location_city'
                        : 'pin_drop'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-headline text-xs font-semibold text-on-surface">
                        {result.name}
                      </span>
                      <span className="font-headline text-[10px] text-on-surface-variant">
                        {result.kind === 'powiat'
                          ? 'Powiat'
                          : `Gmina · pow. ${result.parentName ?? '—'}`}
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-sm text-on-surface-variant">
                      arrow_forward
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Voice control mic ── */}
        {onVoiceAction && <VoiceController onAction={onVoiceAction} />}

        <button
          type="button"
          className="material-symbols-outlined cursor-pointer text-on-surface-variant transition-colors hover:text-primary-dark active:scale-95"
        >
          notifications
        </button>
        <button
          type="button"
          className="material-symbols-outlined cursor-pointer text-on-surface-variant transition-colors hover:text-primary-dark active:scale-95"
        >
          settings
        </button>
        <div className="ml-2 h-8 w-8 overflow-hidden rounded-full border border-outline bg-surface-variant">
          <div className="flex h-full w-full items-center justify-center font-headline text-xs font-bold text-primary-dark">
            WS
          </div>
        </div>
      </div>
    </header>
  );
}
