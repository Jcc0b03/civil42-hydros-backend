import type { ReactNode } from "react";

type Props = {
  title: string;
  meta?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

export function PanelShell({ title, meta, onClose, children }: Props) {
  return (
    <section className="rounded border border-outline bg-white shadow-lg">
      <header className="flex items-center justify-between border-b border-outline px-4 py-3">
        <span className="font-headline text-[11px] font-bold uppercase tracking-wider text-primary-dark">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {meta}
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined text-sm text-on-surface-variant hover:text-critical"
            aria-label="Zamknij panel"
          >
            close
          </button>
        </div>
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}
