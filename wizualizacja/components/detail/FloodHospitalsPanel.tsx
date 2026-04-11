"use client";

import { useFloodHospitals } from "@/lib/useFloodData";
import type { HospitalFloodStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  HospitalFloodStatus,
  { label: string; icon: string; color: string; bg: string; border: string }
> = {
  evacuate: {
    label: "EWAKUACJA",
    icon: "emergency_share",
    color: "text-critical",
    bg: "bg-critical/5",
    border: "border-critical/30",
  },
  at_risk: {
    label: "ZAGROŻONY",
    icon: "warning",
    color: "text-amber-700",
    bg: "bg-amber-500/5",
    border: "border-amber-500/30",
  },
  redirect: {
    label: "PRZEKIERUJ ZASOBY",
    icon: "alt_route",
    color: "text-primary-dark",
    bg: "bg-primary/5",
    border: "border-primary/30",
  },
  operational: {
    label: "OPERACYJNY",
    icon: "check_circle",
    color: "text-primary-dark",
    bg: "bg-primary/5",
    border: "border-primary/30",
  },
};

export function FloodHospitalsPanel({ onClose }: { onClose: () => void }) {
  const { data, loading } = useFloodHospitals();

  return (
    <div className="flex h-fit max-h-[70vh] flex-col overflow-hidden rounded border border-l-4 border-outline border-l-critical bg-white shadow-xl">
      {/* Header */}
      <div className="border-b border-outline bg-surface-variant/30 p-5">
        <div className="mb-1 flex items-start justify-between">
          <span className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-critical">
            Kryzys medyczny – powódź
          </span>
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined text-on-surface-variant hover:text-critical"
          >
            close
          </button>
        </div>
        <h2 className="font-headline text-lg font-extrabold tracking-tight text-on-surface">
          Status szpitali
        </h2>
        <p className="mt-1 font-headline text-xs text-on-surface-variant">
          Analiza na podstawie danych IMGW w czasie rzeczywistym
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center p-8">
          <span className="font-headline text-xs text-on-surface-variant animate-pulse">
            Pobieranie danych z IMGW i OSM...
          </span>
        </div>
      )}

      {data && (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-0 border-b border-outline">
            <div className="border-r border-outline p-3 text-center">
              <span className="block font-headline text-2xl font-black text-critical">
                {data.summary.evacuate}
              </span>
              <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-critical">
                Ewakuacja
              </span>
            </div>
            <div className="border-r border-outline p-3 text-center">
              <span className="block font-headline text-2xl font-black text-amber-600">
                {data.summary.at_risk}
              </span>
              <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-amber-600">
                Zagrożone
              </span>
            </div>
            <div className="p-3 text-center">
              <span className="block font-headline text-2xl font-black text-primary-dark">
                {data.summary.redirect}
              </span>
              <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-primary-dark">
                Przekierowanie
              </span>
            </div>
          </div>

          {/* Hydro alerts */}
          {data.hydro_alerts.length > 0 && (
            <div className="border-b border-outline bg-critical/5 px-4 py-3">
              <span className="mb-2 block font-headline text-[9px] font-bold uppercase tracking-widest text-critical">
                Aktywne alerty hydrologiczne
              </span>
              <div className="flex flex-wrap gap-2">
                {data.hydro_alerts.map((a) => (
                  <span
                    key={`${a.station}-${a.river}`}
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-headline text-[10px] font-bold ${
                      a.status === "critical"
                        ? "bg-critical/10 text-critical"
                        : "bg-amber-500/10 text-amber-700"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[11px]">
                      {a.status === "critical" ? "warning" : "error"}
                    </span>
                    {a.river} ({a.station}) – {a.level_cm} cm
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Hospital list */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-2">
              {data.hospitals.map((h) => {
                const cfg = STATUS_CONFIG[h.flood_status];
                return (
                  <div
                    key={`${h.name}-${h.lat}-${h.lon}`}
                    className={`rounded border p-3 ${cfg.border} ${cfg.bg}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-headline text-xs font-semibold text-on-surface">
                          {h.name}
                        </span>
                        <span className="font-headline text-[10px] text-on-surface-variant">
                          {h.lat.toFixed(3)}°N, {h.lon.toFixed(3)}°E
                        </span>
                      </div>
                      <span
                        className={`flex items-center gap-1 whitespace-nowrap font-headline text-[9px] font-bold uppercase tracking-widest ${cfg.color}`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {cfg.icon}
                        </span>
                        {cfg.label}
                      </span>
                    </div>
                    {h.nearest_threat_station && (
                      <p className="mt-1.5 font-headline text-[10px] text-on-surface-variant">
                        Zagrożenie ze stacji{" "}
                        <strong>{h.nearest_threat_station}</strong> –{" "}
                        {h.threat_distance_km} km
                      </p>
                    )}
                    {h.flood_status === "evacuate" && (
                      <button
                        type="button"
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded bg-critical py-2 font-headline text-[10px] font-bold uppercase tracking-widest text-white hover:opacity-90"
                      >
                        <span className="material-symbols-outlined text-sm">
                          emergency_share
                        </span>
                        Zarządź ewakuację
                      </button>
                    )}
                    {h.flood_status === "redirect" && (
                      <button
                        type="button"
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-primary/30 bg-primary/10 py-2 font-headline text-[10px] font-bold uppercase tracking-widest text-primary-dark hover:bg-primary/20"
                      >
                        <span className="material-symbols-outlined text-sm">
                          alt_route
                        </span>
                        Przekieruj zasoby tutaj
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {!loading && !data && (
        <div className="p-6 text-center">
          <span className="material-symbols-outlined mb-2 text-3xl text-on-surface-variant">
            cloud_off
          </span>
          <p className="font-headline text-xs text-on-surface-variant">
            Nie udało się pobrać danych. Sprawdź połączenie z API.
          </p>
        </div>
      )}
    </div>
  );
}
