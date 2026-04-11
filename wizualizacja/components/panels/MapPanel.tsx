import type { TerritoryKind } from "@/lib/types";
import { PanelShell } from "./PanelShell";

type Props = {
  level: TerritoryKind;
  onLevelChange: (level: TerritoryKind) => void;
  powiatCount: number;
  gminaCount: number;
  onClose: () => void;
};

export function MapPanel({
  level,
  onLevelChange,
  powiatCount,
  gminaCount,
  onClose,
}: Props) {
  return (
    <PanelShell title="Widok mapy" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <span className="mb-2 block font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Poziom podziału
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onLevelChange("powiat")}
              className={
                level === "powiat"
                  ? "rounded border border-primary-dark bg-primary/10 px-3 py-2 font-headline text-xs font-bold uppercase tracking-wider text-primary-dark"
                  : "rounded border border-outline bg-white px-3 py-2 font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-variant"
              }
            >
              Powiaty
              <span className="ml-1 font-mono text-[10px]">({powiatCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onLevelChange("gmina")}
              className={
                level === "gmina"
                  ? "rounded border border-primary-dark bg-primary/10 px-3 py-2 font-headline text-xs font-bold uppercase tracking-wider text-primary-dark"
                  : "rounded border border-outline bg-white px-3 py-2 font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-variant"
              }
            >
              Gminy
              <span className="ml-1 font-mono text-[10px]">({gminaCount})</span>
            </button>
          </div>
        </div>

        <div className="rounded border border-outline bg-surface-variant/50 p-3">
          <p className="font-headline text-[11px] leading-relaxed text-on-surface-variant">
            Kliknij na wybranym obszarze, aby przybliżyć widok. Użyj filtra
            terytorialnego poniżej, aby wybrać konkretny powiat lub gminę
            z rozwijanego drzewka.
          </p>
        </div>
      </div>
    </PanelShell>
  );
}
