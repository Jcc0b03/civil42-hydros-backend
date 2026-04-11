'use client';

import { useFloodOverview } from '@/lib/useFloodData';

function formatMeasuredAt(raw: string): string {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return `${d.toLocaleDateString('pl-PL')} ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return raw;
  }
}

export function FloodOverviewCard() {
  const { data, loading } = useFloodOverview();

  if (loading) {
    return (
      <div className="rounded border border-outline bg-white p-4 shadow-sm">
        <span className="font-headline text-xs text-on-surface-variant animate-pulse">
          Pobieranie danych powodziowych IMGW...
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded border border-outline bg-white p-4 shadow-sm text-center">
        <span className="material-symbols-outlined mb-1 text-2xl text-on-surface-variant">
          cloud_off
        </span>
        <p className="font-headline text-[10px] text-on-surface-variant">
          Brak danych powodziowych
        </p>
      </div>
    );
  }

  const hasHydro = data.hydro_warnings_count > 0;
  const hasMeteo = data.meteo_flood_like_warnings_count > 0;
  const hasDanger = hasHydro || hasMeteo;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded border bg-white shadow-lg ${
        hasDanger
          ? 'border-l-4 border-outline border-l-amber-500'
          : 'border-outline'
      }`}
    >
      {/* Header */}
      <div className="border-b border-outline bg-surface-variant/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`material-symbols-outlined text-base ${
                hasDanger ? 'text-amber-600' : 'text-primary-dark'
              }`}
            >
              flood
            </span>
            <h3 className="font-headline text-xs font-bold uppercase tracking-widest text-on-surface">
              Przegląd zagrożeń powodziowych
            </h3>
          </div>
          <span className="font-headline text-[9px] text-on-surface-variant">
            {data.source}
          </span>
        </div>
      </div>

      {/* Warning counters */}
      <div className="grid grid-cols-3 gap-0 border-b border-outline">
        <div className="border-r border-outline p-3 text-center">
          <span
            className={`block font-headline text-2xl font-black ${
              hasHydro ? 'text-critical' : 'text-primary-dark'
            }`}
          >
            {data.hydro_warnings_count}
          </span>
          <span
            className={`font-headline text-[9px] font-bold uppercase tracking-widest ${
              hasHydro ? 'text-critical' : 'text-primary-dark'
            }`}
          >
            Alerty hydro
          </span>
        </div>
        <div className="border-r border-outline p-3 text-center">
          <span
            className={`block font-headline text-2xl font-black ${
              hasMeteo ? 'text-amber-600' : 'text-primary-dark'
            }`}
          >
            {data.meteo_flood_like_warnings_count}
          </span>
          <span
            className={`font-headline text-[9px] font-bold uppercase tracking-widest ${
              hasMeteo ? 'text-amber-600' : 'text-primary-dark'
            }`}
          >
            Alerty meteo
          </span>
        </div>
        <div className="p-3 text-center">
          <span className="block font-headline text-2xl font-black text-primary-dark">
            {data.lubelskie_station_count}
          </span>
          <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-primary-dark">
            Stacje hydro
          </span>
        </div>
      </div>

      {/* Hydro warnings */}
      {hasHydro && (
        <div className="border-b border-outline bg-critical/5 px-4 py-3">
          <span className="mb-2 block font-headline text-[9px] font-bold uppercase tracking-widest text-critical">
            <span className="material-symbols-outlined mr-1 align-middle text-[11px]">
              warning
            </span>
            Ostrzeżenia hydrologiczne ({data.hydro_warnings_count})
          </span>
          <div className="flex flex-col gap-1.5">
            {data.hydro_warnings.slice(0, 5).map((w, i) => (
              <div
                key={i}
                className="rounded bg-critical/10 px-2.5 py-1.5 font-headline text-[10px] text-critical"
              >
                {(w as Record<string, unknown>).phenomenon
                  ? String((w as Record<string, unknown>).phenomenon)
                  : (w as Record<string, unknown>).description
                    ? String((w as Record<string, unknown>).description).slice(
                        0,
                        120
                      )
                    : JSON.stringify(w).slice(0, 120)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meteo flood-like warnings */}
      {hasMeteo && (
        <div className="border-b border-outline bg-amber-500/5 px-4 py-3">
          <span className="mb-2 block font-headline text-[9px] font-bold uppercase tracking-widest text-amber-700">
            <span className="material-symbols-outlined mr-1 align-middle text-[11px]">
              thunderstorm
            </span>
            Ostrzeżenia meteorologiczne ({data.meteo_flood_like_warnings_count})
          </span>
          <div className="flex flex-col gap-1.5">
            {data.meteo_flood_like_warnings.slice(0, 5).map((w, i) => (
              <div
                key={i}
                className="rounded bg-amber-500/10 px-2.5 py-1.5 font-headline text-[10px] text-amber-700"
              >
                {(w as Record<string, unknown>).phenomenon
                  ? String((w as Record<string, unknown>).phenomenon)
                  : (w as Record<string, unknown>).description
                    ? String((w as Record<string, unknown>).description).slice(
                        0,
                        120
                      )
                    : JSON.stringify(w).slice(0, 120)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top stations */}
      {data.lubelskie_top_stations.length > 0 && (
        <div className="px-4 py-3">
          <span className="mb-2 block font-headline text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
            <span className="material-symbols-outlined mr-1 align-middle text-[11px]">
              water
            </span>
            Najwyższe stany wód — woj. lubelskie
          </span>
          <div className="flex flex-col gap-1.5">
            {data.lubelskie_top_stations.slice(0, 6).map(s => {
              const isHigh = s.water_level_cm > 400;
              const isMedium = s.water_level_cm > 250;
              return (
                <div
                  key={s.station_id}
                  className={`flex items-center justify-between rounded px-2.5 py-1.5 ${
                    isHigh
                      ? 'bg-critical/10'
                      : isMedium
                        ? 'bg-amber-500/10'
                        : 'bg-primary/5'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span
                      className={`font-headline text-[11px] font-semibold ${
                        isHigh
                          ? 'text-critical'
                          : isMedium
                            ? 'text-amber-700'
                            : 'text-on-surface'
                      }`}
                    >
                      {s.station_name}
                    </span>
                    <span className="ml-1.5 font-headline text-[10px] text-on-surface-variant">
                      ({s.river})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-headline text-xs font-black ${
                        isHigh
                          ? 'text-critical'
                          : isMedium
                            ? 'text-amber-700'
                            : 'text-primary-dark'
                      }`}
                    >
                      {s.water_level_cm} cm
                    </span>
                    <span className="font-headline text-[9px] text-on-surface-variant">
                      {formatMeasuredAt(s.measured_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasDanger && data.lubelskie_top_stations.length === 0 && (
        <div className="flex items-center gap-2 p-4">
          <span className="material-symbols-outlined text-base text-primary-dark">
            check_circle
          </span>
          <span className="font-headline text-xs text-primary-dark">
            Brak aktywnych zagrożeń powodziowych w regionie
          </span>
        </div>
      )}
    </div>
  );
}
