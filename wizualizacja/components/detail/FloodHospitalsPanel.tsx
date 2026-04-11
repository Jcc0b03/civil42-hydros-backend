'use client';

import { useFloodPrediction } from '@/lib/useFloodData';
import type { FloodRiskHospital } from '@/lib/types';

function riskConfig(level: string) {
  switch (level) {
    case 'high':
      return {
        label: 'WYSOKIE RYZYKO',
        icon: 'emergency_share',
        color: 'text-critical',
        bg: 'bg-critical/5',
        border: 'border-critical/30'
      };
    case 'medium':
      return {
        label: 'UMIARKOWANE',
        icon: 'warning',
        color: 'text-amber-700',
        bg: 'bg-amber-500/5',
        border: 'border-amber-500/30'
      };
    default:
      return {
        label: 'NISKIE',
        icon: 'check_circle',
        color: 'text-primary-dark',
        bg: 'bg-primary/5',
        border: 'border-primary/30'
      };
  }
}

export function FloodHospitalsPanel({ onClose }: { onClose: () => void }) {
  const { data, loading } = useFloodPrediction();

  const highRisk =
    data?.at_risk_hospitals.filter(h => h.station_risk_level === 'high')
      .length ?? 0;
  const medRisk =
    data?.at_risk_hospitals.filter(h => h.station_risk_level === 'medium')
      .length ?? 0;

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
          Szpitale zagrożone powodzią
        </h2>
        <p className="mt-1 font-headline text-xs text-on-surface-variant">
          Predykcja na podstawie danych IMGW w czasie rzeczywistym
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center p-8">
          <span className="font-headline text-xs text-on-surface-variant animate-pulse">
            Analizowanie ryzyka powodziowego...
          </span>
        </div>
      )}

      {data && (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-0 border-b border-outline">
            <div className="border-r border-outline p-3 text-center">
              <span className="block font-headline text-2xl font-black text-critical">
                {highRisk}
              </span>
              <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-critical">
                Wys. ryzyko
              </span>
            </div>
            <div className="border-r border-outline p-3 text-center">
              <span className="block font-headline text-2xl font-black text-amber-600">
                {medRisk}
              </span>
              <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-amber-600">
                Umiarkowane
              </span>
            </div>
            <div className="p-3 text-center">
              <span className="block font-headline text-2xl font-black text-primary-dark">
                {data.risk_stations_count}
              </span>
              <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-primary-dark">
                Stacji hydro
              </span>
            </div>
          </div>

          {/* Risk stations summary */}
          {data.risk_stations.filter(s => s.risk_level === 'high').length >
            0 && (
            <div className="border-b border-outline bg-critical/5 px-4 py-3">
              <span className="mb-2 block font-headline text-[9px] font-bold uppercase tracking-widest text-critical">
                Stacje o wysokim ryzyku
              </span>
              <div className="flex flex-wrap gap-2">
                {data.risk_stations
                  .filter(s => s.risk_level === 'high')
                  .map(s => (
                    <span
                      key={s.station_id}
                      className="inline-flex items-center gap-1 rounded bg-critical/10 px-2 py-0.5 font-headline text-[10px] font-bold text-critical"
                    >
                      <span className="material-symbols-outlined text-[11px]">
                        warning
                      </span>
                      {s.river} ({s.station_name}) – {s.latest_water_level_cm}{' '}
                      cm
                      {s.trend_cm_per_hour !== 0 && (
                        <span className="text-[9px]">
                          {s.trend_cm_per_hour > 0 ? '↑' : '↓'}
                          {Math.abs(s.trend_cm_per_hour).toFixed(1)}/h
                        </span>
                      )}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Hospital list */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-2">
              {data.at_risk_hospitals.map((h: FloodRiskHospital) => {
                const cfg = riskConfig(h.station_risk_level);
                return (
                  <div
                    key={h.id}
                    className={`rounded border p-3 ${cfg.border} ${cfg.bg}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-headline text-xs font-semibold text-on-surface">
                          {h.hospital_name}
                        </span>
                        <span className="font-headline text-[10px] text-on-surface-variant">
                          {h.address}
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
                    <div className="mt-1.5 flex items-center gap-3 font-headline text-[10px] text-on-surface-variant">
                      <span>
                        Stacja: <strong>{h.nearest_risk_station_name}</strong> –{' '}
                        {h.distance_km.toFixed(1)} km
                      </span>
                      <span>
                        Łóżka: {h.total_free_beds}/{h.total_beds}
                      </span>
                    </div>
                    {h.station_risk_level === 'high' && (
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
