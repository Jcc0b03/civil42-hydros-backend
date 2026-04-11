'use client';

import type { ApiHospital } from '@/lib/types';

type Props = {
  hospital: ApiHospital;
  onClose: () => void;
};

export function HospitalDetailPanel({ hospital, onClose }: Props) {
  const totalFree = hospital.departments.reduce((s, d) => s + d.free_beds, 0);
  const totalBeds = hospital.departments.reduce(
    (s, d) => s + (d.total_beds ?? 0),
    0
  );
  const ratio = totalBeds > 0 ? totalFree / totalBeds : 1;

  const statusLabel =
    ratio < 0.1 ? 'KRYTYCZNY' : ratio < 0.3 ? 'OGRANICZONY' : 'DOSTĘPNY';
  const statusColor =
    ratio < 0.1
      ? 'text-critical'
      : ratio < 0.3
        ? 'text-amber-700'
        : 'text-primary-dark';

  return (
    <div className="flex flex-col overflow-hidden rounded border border-outline bg-white shadow-xl">
      <div className="flex items-start justify-between border-b border-outline bg-surface-variant/30 p-4">
        <div className="min-w-0">
          <span className="block font-headline text-[10px] font-bold uppercase tracking-widest text-primary-dark">
            Placówka medyczna
          </span>
          <h2 className="font-headline text-lg font-extrabold text-on-surface leading-tight">
            {hospital.hospital_name}
          </h2>
          <p className="mt-0.5 font-headline text-[10px] text-on-surface-variant">
            {hospital.address}
          </p>
          {hospital.latitude != null && hospital.longitude != null && (
            <p className="mt-0.5 font-mono text-[10px] text-on-surface-variant">
              {hospital.latitude.toFixed(4)}°N, {hospital.longitude.toFixed(4)}
              °E
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="material-symbols-outlined text-on-surface-variant hover:text-critical"
        >
          close
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-0 border-b border-outline">
        <div className="border-r border-outline p-3 text-center">
          <span className="block font-headline text-2xl font-black text-primary-dark">
            {totalFree}
          </span>
          <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
            Wolne
          </span>
        </div>
        <div className="border-r border-outline p-3 text-center">
          <span className="block font-headline text-2xl font-black text-on-surface">
            {totalBeds}
          </span>
          <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
            Ogółem
          </span>
        </div>
        <div className="p-3 text-center">
          <span
            className={`block font-headline text-sm font-black uppercase ${statusColor}`}
          >
            {statusLabel}
          </span>
          <span className="font-headline text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
            Status
          </span>
        </div>
      </div>

      {/* Department list */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 font-headline text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
          Oddziały ({hospital.departments.length})
        </div>
        <div className="flex flex-col gap-1.5">
          {hospital.departments.map(dept => {
            const dRatio = dept.total_beds
              ? dept.free_beds / dept.total_beds
              : 1;
            const dFill =
              dRatio < 0.1
                ? 'bg-critical'
                : dRatio < 0.3
                  ? 'bg-amber-500'
                  : 'bg-primary';
            const dColor =
              dRatio < 0.1
                ? 'text-critical'
                : dRatio < 0.3
                  ? 'text-amber-700'
                  : 'text-primary-dark';
            const pct = dept.total_beds
              ? Math.round((dept.free_beds / dept.total_beds) * 100)
              : 100;

            return (
              <div
                key={dept.department_id}
                className="rounded border border-outline bg-surface-variant/30 p-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-headline text-[11px] font-semibold text-on-surface">
                    {dept.department_name}
                  </span>
                  <span
                    className={`whitespace-nowrap font-headline text-[11px] font-bold ${dColor}`}
                  >
                    {dept.free_beds}/{dept.total_beds ?? '?'} łóżek
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-outline">
                  <div
                    className={`h-full rounded-full ${dFill} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {dept.source_updated_at && (
                  <span className="mt-1 block font-mono text-[9px] text-on-surface-variant">
                    Akt.: {dept.source_updated_at}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
