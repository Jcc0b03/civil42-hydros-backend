'use client';

import { useState } from 'react';
import type { ApiHospital } from '@/lib/types';

type Props = {
  hospitals: ApiHospital[];
  loading: boolean;
  onSelectHospital?: (hospital: ApiHospital) => void;
};

export function HospitalListPanel({
  hospitals,
  loading,
  onSelectHospital
}: Props) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = hospitals.filter(
    h =>
      h.hospital_name.toLowerCase().includes(search.toLowerCase()) ||
      h.address.toLowerCase().includes(search.toLowerCase())
  );

  const totalFreeAll = hospitals.reduce(
    (s, h) => s + h.departments.reduce((ds, d) => ds + d.free_beds, 0),
    0
  );
  const totalBedsAll = hospitals.reduce(
    (s, h) => s + h.departments.reduce((ds, d) => ds + (d.total_beds ?? 0), 0),
    0
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-outline bg-surface-variant/30 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-primary-dark">
              Rejestr placówek
            </span>
            <h2 className="font-headline text-lg font-extrabold tracking-tight text-on-surface">
              Szpitale woj. lubelskiego
            </h2>
          </div>
          <div className="flex items-center gap-1.5 rounded border border-primary/20 bg-primary/10 px-2 py-0.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-dark">
              LIVE
            </span>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded border border-outline bg-white p-2 text-center">
            <span className="block font-headline text-xl font-black text-primary-dark">
              {hospitals.length}
            </span>
            <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
              Placówek
            </span>
          </div>
          <div className="rounded border border-outline bg-white p-2 text-center">
            <span className="block font-headline text-xl font-black text-primary-dark">
              {totalFreeAll}
            </span>
            <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
              Wolnych łóżek
            </span>
          </div>
          <div className="rounded border border-outline bg-white p-2 text-center">
            <span className="block font-headline text-xl font-black text-primary-dark">
              {totalBedsAll}
            </span>
            <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
              Łóżek ogółem
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="mt-3 flex items-center rounded border border-outline bg-white px-3 py-1.5">
          <span className="material-symbols-outlined mr-2 text-sm text-on-surface-variant">
            search
          </span>
          <input
            type="text"
            placeholder="Szukaj szpitala lub adresu..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border-none bg-transparent text-xs text-on-surface focus:outline-none focus:ring-0"
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center p-8">
          <span className="font-headline text-xs text-on-surface-variant animate-pulse">
            Pobieranie danych szpitali...
          </span>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {filtered.map(hospital => {
            const totalFree = hospital.departments.reduce(
              (s, d) => s + d.free_beds,
              0
            );
            const totalBeds = hospital.departments.reduce(
              (s, d) => s + (d.total_beds ?? 0),
              0
            );
            const ratio = totalBeds > 0 ? totalFree / totalBeds : 1;
            const isExpanded = expandedId === hospital.id;

            const statusColor =
              ratio < 0.1
                ? 'border-critical/30 bg-critical/5'
                : ratio < 0.3
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-primary/30 bg-primary/5';

            const badgeColor =
              ratio < 0.1
                ? 'text-critical'
                : ratio < 0.3
                  ? 'text-amber-700'
                  : 'text-primary-dark';

            const statusLabel =
              ratio < 0.1
                ? 'KRYTYCZNY'
                : ratio < 0.3
                  ? 'OGRANICZONY'
                  : 'DOSTĘPNY';

            return (
              <div
                key={hospital.id}
                className={`rounded border p-3 ${statusColor}`}
              >
                <div
                  className="flex cursor-pointer items-start justify-between gap-2"
                  onClick={() => setExpandedId(isExpanded ? null : hospital.id)}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-headline text-xs font-semibold text-on-surface">
                      {hospital.hospital_name}
                    </span>
                    <span className="font-headline text-[10px] text-on-surface-variant">
                      {hospital.address}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`font-headline text-[9px] font-bold uppercase tracking-widest ${badgeColor}`}
                    >
                      {statusLabel}
                    </span>
                    <span className="font-headline text-xs font-bold text-on-surface">
                      {totalFree}/{totalBeds} łóżek
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-1.5">
                    <div className="font-headline text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Oddziały ({hospital.departments.length})
                    </div>
                    {hospital.departments.map(dept => {
                      const dRatio = dept.total_beds
                        ? dept.free_beds / dept.total_beds
                        : 1;
                      const dColor =
                        dRatio < 0.1
                          ? 'text-critical'
                          : dRatio < 0.3
                            ? 'text-amber-700'
                            : 'text-primary-dark';
                      return (
                        <div
                          key={dept.department_id}
                          className="flex items-center justify-between rounded bg-white/60 px-2 py-1.5"
                        >
                          <span className="truncate font-headline text-[11px] text-on-surface">
                            {dept.department_name}
                          </span>
                          <span
                            className={`whitespace-nowrap font-headline text-[11px] font-bold ${dColor}`}
                          >
                            {dept.free_beds}/{dept.total_beds ?? '?'} łóżek
                          </span>
                        </div>
                      );
                    })}
                    {hospital.latitude != null &&
                      hospital.longitude != null && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onSelectHospital?.(hospital);
                          }}
                          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded border border-primary/30 bg-primary/10 py-2 font-headline text-[10px] font-bold uppercase tracking-widest text-primary-dark hover:bg-primary/20"
                        >
                          <span className="material-symbols-outlined text-sm">
                            location_on
                          </span>
                          Pokaż na mapie
                        </button>
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!loading && filtered.length === 0 && (
          <div className="p-6 text-center">
            <span className="material-symbols-outlined mb-2 text-3xl text-on-surface-variant">
              search_off
            </span>
            <p className="font-headline text-xs text-on-surface-variant">
              Brak wyników dla &ldquo;{search}&rdquo;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
