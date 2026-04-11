import type { LayerToggles } from "@/lib/types";
import { PanelShell } from "./PanelShell";

type Props = {
  toggles: LayerToggles;
  onToggle: (key: keyof LayerToggles) => void;
  onClose: () => void;
};

type Row = {
  key: keyof LayerToggles;
  label: string;
  group: string;
  groupIcon: string;
};

const ROWS: Row[] = [
  {
    key: "hospitals",
    label: "Szpitale (status SOR)",
    group: "Zasoby medyczne",
    groupIcon: "local_hospital",
  },
  {
    key: "floodZones",
    label: "Strefy zalewowe (ISOK)",
    group: "Zagrożenia środowiskowe",
    groupIcon: "warning",
  },
  {
    key: "cameras",
    label: "Kamery miejskie",
    group: "Monitoring",
    groupIcon: "videocam",
  },
  {
    key: "powiatBoundaries",
    label: "Granice powiatów",
    group: "Podział administracyjny",
    groupIcon: "map",
  },
  {
    key: "gminaBoundaries",
    label: "Granice gmin",
    group: "Podział administracyjny",
    groupIcon: "map",
  },
];

export function LayersPanel({ toggles, onToggle, onClose }: Props) {
  const activeCount = Object.values(toggles).filter(Boolean).length;

  const grouped = ROWS.reduce<Record<string, Row[]>>((acc, row) => {
    if (!acc[row.group]) acc[row.group] = [];
    acc[row.group].push(row);
    return acc;
  }, {});

  return (
    <PanelShell
      title="Warstwy taktyczne"
      onClose={onClose}
      meta={
        <span className="text-[10px] text-on-surface-variant">
          {activeCount} aktywnych
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        {Object.entries(grouped).map(([group, rows]) => (
          <div key={group} className="space-y-2">
            <div className="flex items-center gap-2 px-1 font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              <span className="material-symbols-outlined text-xs">
                {rows[0]?.groupIcon}
              </span>
              {group}
            </div>
            {rows.map((row) => {
              const enabled = toggles[row.key];
              return (
                <button
                  type="button"
                  key={row.key}
                  onClick={() => onToggle(row.key)}
                  className="flex w-full items-center justify-between rounded bg-surface-variant/50 p-2 hover:bg-surface-variant"
                >
                  <span className="font-headline text-xs">{row.label}</span>
                  <span
                    className={
                      enabled
                        ? "relative h-4 w-8 rounded-full bg-primary shadow-inner"
                        : "relative h-4 w-8 rounded-full bg-outline shadow-inner"
                    }
                  >
                    <span
                      className={
                        enabled
                          ? "absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-all"
                          : "absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-all"
                      }
                    />
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
