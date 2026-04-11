import { RIVER_TICKER } from "@/lib/constants";
import type { RiverStatus } from "@/lib/types";

const STATUS_ICON: Record<RiverStatus["status"], string> = {
  critical: "warning",
  warning: "error",
  stable: "check_circle",
};

function TickerRow() {
  return (
    <>
      {RIVER_TICKER.map((river) => (
        <div
          key={river.name}
          className={
            river.status === "stable"
              ? "flex items-center gap-2 px-6 font-headline text-xs font-bold uppercase tracking-widest text-white/90"
              : "flex items-center gap-2 px-6 font-headline text-xs font-bold uppercase tracking-widest text-white"
          }
        >
          <span className="material-symbols-outlined text-sm">
            {STATUS_ICON[river.status]}
          </span>
          <span>
            {river.name}: {river.level} ({river.status.toUpperCase()})
          </span>
        </div>
      ))}
    </>
  );
}

export function BottomTicker() {
  return (
    <footer
      className="fixed bottom-0 left-0 z-[100] flex h-10 w-full items-center overflow-hidden whitespace-nowrap bg-critical-deep"
      style={{ boxShadow: "0 -4px 20px rgba(187,0,19,0.2)" }}
    >
      <div className="flex min-w-max animate-ticker items-center whitespace-nowrap">
        <TickerRow />
        <TickerRow />
      </div>
    </footer>
  );
}
