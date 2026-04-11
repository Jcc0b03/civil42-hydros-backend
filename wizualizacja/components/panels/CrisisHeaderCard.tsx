"use client";

import { useEffect, useState } from "react";
import type { HydroStation } from "@/lib/types";

const API_BASE = "http://localhost:8000";

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} | ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())} CET`;
}

type HydroSummary = { critical: number; warning: number; stable: number; total: number };

function useHydroSummary(): HydroSummary {
  const [summary, setSummary] = useState<HydroSummary>({ critical: 0, warning: 0, stable: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/hydro`);
        const data: HydroStation[] = await r.json();
        if (cancelled || !Array.isArray(data)) return;
        const s = { critical: 0, warning: 0, stable: 0, total: data.length };
        for (const st of data) {
          if (st.status === "critical") s.critical++;
          else if (st.status === "warning") s.warning++;
          else s.stable++;
        }
        setSummary(s);
      } catch { /* keep defaults */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return summary;
}

export function CrisisHeaderCard() {
  const [now, setNow] = useState<Date | null>(null);
  const hydro = useHydroSummary();

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hasCrisis = hydro.critical > 0;
  const hasWarning = hydro.warning > 0;

  return (
    <div className="rounded border border-outline bg-white shadow-lg">
      <div className="p-5 pb-3">
        <div className="mb-2 flex items-start justify-between">
          <h2 className="font-headline text-lg font-bold leading-tight text-on-surface">
            Crisis Command Center
            <br />
            <span className="text-primary-dark">Lubelskie</span>
          </h2>
          <div className="flex items-center gap-1.5 rounded border border-primary/20 bg-primary/10 px-2 py-0.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-dark">
              LIVE DATA
            </span>
          </div>
        </div>
        <p className="flex items-center gap-2 font-mono text-[10px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[12px]">schedule</span>
          {now ? formatTimestamp(now) : "\u00A0"}
        </p>
      </div>

      {/* ── Flood status bar ── */}
      {hydro.total > 0 && (
        <div className={`border-t px-4 py-3 ${
          hasCrisis
            ? 'border-critical/20 bg-critical/5'
            : hasWarning
              ? 'border-amber-500/20 bg-amber-50'
              : 'border-primary/20 bg-primary/5'
        }`}>
          <div className="mb-2 flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-sm ${
              hasCrisis ? 'text-critical' : hasWarning ? 'text-amber-600' : 'text-primary-dark'
            }`}>
              flood
            </span>
            <span className={`font-headline text-[10px] font-bold uppercase tracking-widest ${
              hasCrisis ? 'text-critical' : hasWarning ? 'text-amber-600' : 'text-primary-dark'
            }`}>
              Stan hydrologiczny — {hydro.total} stacji
            </span>
          </div>
          <div className="flex gap-3">
            {hydro.critical > 0 && (
              <div className="flex items-center gap-1.5 rounded bg-critical/10 px-2.5 py-1">
                <span className="material-symbols-outlined text-xs text-critical">warning</span>
                <span className="font-headline text-xs font-black text-critical">{hydro.critical}</span>
                <span className="font-headline text-[9px] font-bold uppercase text-critical">alarm</span>
              </div>
            )}
            {hydro.warning > 0 && (
              <div className="flex items-center gap-1.5 rounded bg-amber-500/10 px-2.5 py-1">
                <span className="material-symbols-outlined text-xs text-amber-600">error</span>
                <span className="font-headline text-xs font-black text-amber-700">{hydro.warning}</span>
                <span className="font-headline text-[9px] font-bold uppercase text-amber-600">ostrzeż.</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 rounded bg-primary/10 px-2.5 py-1">
              <span className="material-symbols-outlined text-xs text-primary-dark">check_circle</span>
              <span className="font-headline text-xs font-black text-primary-dark">{hydro.stable}</span>
              <span className="font-headline text-[9px] font-bold uppercase text-primary-dark">norma</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
