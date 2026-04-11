'use client';

import { useEffect, useState } from 'react';
import { useFloodOverview } from '@/lib/useFloodData';

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} | ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())} CET`;
}

export function CrisisHeaderCard() {
  const [now, setNow] = useState<Date | null>(null);
  const { data: flood } = useFloodOverview();

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const stationCount = flood?.lubelskie_station_count ?? 0;
  const hydroWarnings = flood?.hydro_warnings_count ?? 0;
  const meteoWarnings = flood?.meteo_flood_like_warnings_count ?? 0;
  const hasCrisis = hydroWarnings > 0;
  const hasWarning = meteoWarnings > 0;

  return (
    <div className="rounded border border-outline bg-white shadow-lg">
      <div className="p-5 pb-3">
        <div className="mb-2 flex items-start justify-between">
          <h2 className="font-headline text-lg font-bold leading-tight text-on-surface">
            Centrum Zarządzania Kryzysowego
            <br />
            <span className="text-primary-dark">Lubelskie</span>
          </h2>
          <div className="flex items-center gap-1.5 rounded border border-primary/20 bg-primary/10 px-2 py-0.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-dark">
              DANE NA ŻYWO
            </span>
          </div>
        </div>
        <p className="flex items-center gap-2 font-mono text-[10px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[12px]">
            schedule
          </span>
          {now ? formatTimestamp(now) : '\u00A0'}
        </p>
      </div>

      {/* ── Flood status bar ── */}
      {stationCount > 0 && (
        <div
          className={`border-t px-4 py-3 ${
            hasCrisis
              ? 'border-critical/20 bg-critical/5'
              : hasWarning
                ? 'border-amber-500/20 bg-amber-50'
                : 'border-primary/20 bg-primary/5'
          }`}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <span
              className={`material-symbols-outlined text-sm ${
                hasCrisis
                  ? 'text-critical'
                  : hasWarning
                    ? 'text-amber-600'
                    : 'text-primary-dark'
              }`}
            >
              flood
            </span>
            <span
              className={`font-headline text-[10px] font-bold uppercase tracking-widest ${
                hasCrisis
                  ? 'text-critical'
                  : hasWarning
                    ? 'text-amber-600'
                    : 'text-primary-dark'
              }`}
            >
              Stan hydrologiczny — {stationCount} stacji
            </span>
          </div>
          <div className="flex gap-3">
            {hydroWarnings > 0 && (
              <div className="flex items-center gap-1.5 rounded bg-critical/10 px-2.5 py-1">
                <span className="material-symbols-outlined text-xs text-critical">
                  warning
                </span>
                <span className="font-headline text-xs font-black text-critical">
                  {hydroWarnings}
                </span>
                <span className="font-headline text-[9px] font-bold uppercase text-critical">
                  alerty hydro
                </span>
              </div>
            )}
            {meteoWarnings > 0 && (
              <div className="flex items-center gap-1.5 rounded bg-amber-500/10 px-2.5 py-1">
                <span className="material-symbols-outlined text-xs text-amber-600">
                  error
                </span>
                <span className="font-headline text-xs font-black text-amber-700">
                  {meteoWarnings}
                </span>
                <span className="font-headline text-[9px] font-bold uppercase text-amber-600">
                  alerty meteo
                </span>
              </div>
            )}
            {!hasCrisis && !hasWarning && (
              <div className="flex items-center gap-1.5 rounded bg-primary/10 px-2.5 py-1">
                <span className="material-symbols-outlined text-xs text-primary-dark">
                  check_circle
                </span>
                <span className="font-headline text-xs font-black text-primary-dark">
                  {stationCount}
                </span>
                <span className="font-headline text-[9px] font-bold uppercase text-primary-dark">
                  norma
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
