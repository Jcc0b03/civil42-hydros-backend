"use client";

import { useEffect, useState } from "react";
import { RIVER_TICKER } from "@/lib/constants";
import type { HydroStation, RiverStatus } from "@/lib/types";

const API_BASE = "http://localhost:8000";

const STATUS_ICON: Record<RiverStatus["status"], string> = {
  critical: "warning",
  warning: "error",
  stable: "check_circle",
};

function useHydroTicker(): RiverStatus[] {
  const [rivers, setRivers] = useState<RiverStatus[]>(RIVER_TICKER);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/hydro`);
        const data: HydroStation[] = await r.json();
        if (cancelled || !Array.isArray(data) || data.length === 0) return;

        // Deduplicate by river name, keep the worst status
        const byRiver = new Map<string, RiverStatus>();
        for (const s of data) {
          const name = s.river || s.station || "?";
          const existing = byRiver.get(name);
          const priority = { critical: 0, warning: 1, stable: 2 };
          if (
            !existing ||
            priority[s.status] < priority[existing.status]
          ) {
            byRiver.set(name, {
              name,
              level: s.level_cm ? `${s.level_cm}cm` : "—",
              status: s.status,
            });
          }
        }
        setRivers(Array.from(byRiver.values()).slice(0, 12));
      } catch {
        /* keep fallback data */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return rivers;
}

function TickerRow({ rivers }: { rivers: RiverStatus[] }) {
  return (
    <>
      {rivers.map((river) => {
        const isCritical = river.status === "critical";
        const isWarning = river.status === "warning";
        return (
          <div
            key={river.name}
            className="flex items-center gap-2 px-5 font-headline text-xs font-bold uppercase tracking-widest text-white"
          >
            <span className={`material-symbols-outlined text-sm ${
              isCritical ? 'animate-pulse' : ''
            }`}>
              {STATUS_ICON[river.status]}
            </span>
            <span>
              {river.name}: {river.level}
            </span>
            {isCritical && (
              <span className="rounded bg-white/20 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-white">
                ALARM
              </span>
            )}
            {isWarning && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[8px] font-bold tracking-widest text-white/80">
                OSTRZEŻ.
              </span>
            )}
            <span className="text-white/40">│</span>
          </div>
        );
      })}
    </>
  );
}

export function BottomTicker() {
  const rivers = useHydroTicker();
  const hasCritical = rivers.some(r => r.status === "critical");

  return (
    <footer
      className={`fixed bottom-0 left-0 z-[100] flex h-10 w-full items-center overflow-hidden whitespace-nowrap ${
        hasCritical ? 'bg-critical-deep' : 'bg-primary-dark'
      }`}
      style={{ boxShadow: hasCritical ? "0 -4px 20px rgba(187,0,19,0.3)" : "0 -4px 20px rgba(45,108,0,0.2)" }}
    >
      {hasCritical && (
        <div className="flex h-full items-center gap-1.5 bg-critical px-4">
          <span className="material-symbols-outlined animate-pulse text-sm text-white">flood</span>
          <span className="font-headline text-[9px] font-black uppercase tracking-widest text-white">
            ALERT POWODZIOWY
          </span>
        </div>
      )}
      <div className="flex min-w-max animate-ticker items-center whitespace-nowrap">
        <TickerRow rivers={rivers} />
        <TickerRow rivers={rivers} />
      </div>
    </footer>
  );
}
