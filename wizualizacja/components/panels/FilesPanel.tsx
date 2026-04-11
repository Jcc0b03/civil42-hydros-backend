import { PanelShell } from "./PanelShell";

const FILES = [
  { name: "Plan ewakuacji Puławy v3.pdf", size: "1.2 MB", date: "2026-04-08" },
  { name: "Mapa stref zalewowych ISOK.geojson", size: "612 KB", date: "2026-04-05" },
  { name: "Raport dobowy SOR.xlsx", size: "82 KB", date: "2026-04-11" },
  { name: "Procedura redukcji ruchu 801.docx", size: "44 KB", date: "2026-03-30" },
];

export function FilesPanel({ onClose }: { onClose: () => void }) {
  return (
    <PanelShell title="Dokumenty i dane" onClose={onClose}>
      <div className="flex flex-col">
        {FILES.map((file) => (
          <button
            type="button"
            key={file.name}
            className="flex items-center gap-3 border-b border-outline px-2 py-2 text-left last:border-0 hover:bg-surface-variant"
          >
            <span className="material-symbols-outlined text-base text-primary-dark">
              description
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-headline text-xs font-semibold text-on-surface">
                {file.name}
              </span>
              <span className="font-mono text-[10px] text-on-surface-variant">
                {file.size} · {file.date}
              </span>
            </div>
            <span className="material-symbols-outlined text-sm text-on-surface-variant">
              download
            </span>
          </button>
        ))}
      </div>
    </PanelShell>
  );
}
