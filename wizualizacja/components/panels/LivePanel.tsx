import { CAMERA_FEEDS } from "@/lib/constants";
import type { CameraFeed } from "@/lib/types";
import { PanelShell } from "./PanelShell";

type Props = {
  onSelectCamera: (camera: CameraFeed) => void;
  onClose: () => void;
};

const ALERT_STYLE: Record<CameraFeed["alertLevel"], string> = {
  good: "bg-primary/10 text-primary-dark border-primary/20",
  meh: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  bad: "bg-critical/10 text-critical border-critical/20",
};

export function LivePanel({ onSelectCamera, onClose }: Props) {
  return (
    <PanelShell
      title="Kamery na żywo"
      onClose={onClose}
      meta={
        <span className="text-[10px] text-on-surface-variant">
          {CAMERA_FEEDS.length} feedów
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        {CAMERA_FEEDS.map((camera) => (
          <button
            type="button"
            key={camera.id}
            onClick={() => onSelectCamera(camera)}
            className="group flex items-start justify-between gap-2 rounded border border-outline bg-surface-variant/40 p-2 text-left transition-colors hover:bg-surface-variant"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-headline text-xs font-semibold text-on-surface">
                {camera.label}
              </span>
              <span className="font-mono text-[10px] text-on-surface-variant">
                {camera.lat.toFixed(3)}°N, {camera.lon.toFixed(3)}°E
              </span>
            </div>
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 font-headline text-[9px] font-bold uppercase ${ALERT_STYLE[camera.alertLevel]}`}
            >
              {camera.alertText}
            </span>
          </button>
        ))}
      </div>
    </PanelShell>
  );
}
