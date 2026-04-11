import { SIDEBAR_ITEMS } from "@/lib/constants";
import type { PanelId } from "@/lib/types";

type Props = {
  activePanel: PanelId | null;
  onSelect: (panel: PanelId) => void;
};

export function SideNavBar({ activePanel, onSelect }: Props) {
  return (
    <aside className="fixed left-0 top-16 z-40 flex h-[calc(100vh-6.5rem)] w-[72px] flex-col items-center border-r border-outline bg-surface-variant py-4">
      <div className="mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded border border-outline bg-white">
          <span
            className="material-symbols-outlined text-primary-dark"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            radar
          </span>
        </div>
      </div>

      <nav className="flex w-full flex-grow flex-col items-center gap-2">
        {SIDEBAR_ITEMS.map((item) => {
          const active = activePanel === item.id;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={
                active
                  ? "group relative flex h-14 w-14 flex-col items-center justify-center rounded-lg bg-white text-primary-dark shadow-sm transition-all duration-200"
                  : "group relative flex h-14 w-14 flex-col items-center justify-center text-on-surface/60 transition-all duration-200 hover:bg-outline hover:opacity-100"
              }
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="mt-0.5 text-[8px] font-bold uppercase">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mb-4 flex w-full justify-center px-2">
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded bg-primary-dark text-white transition-colors hover:bg-black"
        >
          <span className="material-symbols-outlined">rocket_launch</span>
        </button>
      </div>

      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          type="button"
          className="flex h-10 w-12 items-center justify-center text-on-surface/60 hover:opacity-100"
        >
          <span className="material-symbols-outlined text-lg">dns</span>
        </button>
        <button
          type="button"
          className="flex h-10 w-12 items-center justify-center text-on-surface/60 hover:opacity-100"
        >
          <span className="material-symbols-outlined text-lg">help</span>
        </button>
      </div>
    </aside>
  );
}
