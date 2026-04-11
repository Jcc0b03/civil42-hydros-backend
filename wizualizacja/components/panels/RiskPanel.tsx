import { PanelShell } from './PanelShell';
import { useFloodOverview } from '@/lib/useFloodData';

const RISK_ITEMS = [
  {
    label: 'Powódź - zlewnia Bugu',
    level: 'KRYTYCZNY',
    tone: 'critical' as const,
    note: 'Prognoza przekroczenia stanu alarmowego w 12h'
  },
  {
    label: 'Podtopienie - Wisła (Puławy)',
    level: 'OSTRZEGAWCZY',
    tone: 'warning' as const,
    note: 'Tendencja rosnąca, monitoring ciągły'
  },
  {
    label: 'Wichury - powiat chełmski',
    level: 'UWAGA',
    tone: 'warning' as const,
    note: 'Porywy do 95 km/h w oknie 18:00-22:00'
  },
  {
    label: 'Pożary lasów',
    level: 'NISKI',
    tone: 'stable' as const,
    note: 'Wilgotność ściółki > 40%'
  }
];

const TONE_STYLE = {
  critical: 'border-critical/30 bg-critical/5 text-critical',
  warning: 'border-amber-500/30 bg-amber-500/5 text-amber-700',
  stable: 'border-primary/30 bg-primary/5 text-primary-dark'
};

export function RiskPanel({ onClose }: { onClose: () => void }) {
  const { data: flood } = useFloodOverview();

  const hydroWarnings = flood?.hydro_warnings ?? [];
  const meteoWarnings = flood?.meteo_flood_like_warnings ?? [];
  const allWarnings = [...hydroWarnings, ...meteoWarnings];

  return (
    <PanelShell title="Rejestr ryzyk" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {/* Live IMGW flood warnings from /api/flood/overview */}
        {allWarnings.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-1 font-headline text-[9px] font-bold uppercase tracking-widest text-critical">
              <span className="material-symbols-outlined text-xs">flood</span>
              Ostrzeżenia IMGW (live) — {allWarnings.length}
            </div>
            {allWarnings.map((w, i) => (
              <div
                key={i}
                className="rounded border border-critical/30 bg-critical/5 p-3 text-critical"
              >
                <div className="flex items-center justify-between">
                  <span className="font-headline text-xs font-semibold text-on-surface">
                    {w.phenomenon || w.title || 'Ostrzeżenie'}
                  </span>
                  <span className="font-headline text-[9px] font-bold uppercase tracking-widest">
                    STOPIEŃ {w.level ?? '?'}
                  </span>
                </div>
                <p className="mt-1 font-headline text-[11px] text-on-surface-variant">
                  {w.description || w.content || ''}
                </p>
              </div>
            ))}
          </>
        )}

        {/* Static risk items */}
        <div className="flex items-center gap-2 px-1 pt-1 font-headline text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
          <span className="material-symbols-outlined text-xs">analytics</span>
          Analiza scenariuszy
        </div>
        {RISK_ITEMS.map(item => (
          <div
            key={item.label}
            className={`rounded border p-3 ${TONE_STYLE[item.tone]}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-headline text-xs font-semibold text-on-surface">
                {item.label}
              </span>
              <span className="font-headline text-[9px] font-bold uppercase tracking-widest">
                {item.level}
              </span>
            </div>
            <p className="mt-1 font-headline text-[11px] text-on-surface-variant">
              {item.note}
            </p>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
