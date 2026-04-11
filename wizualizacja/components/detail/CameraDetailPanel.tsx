"use client";

import { useEffect, useRef, useState } from "react";
import type { CameraFeed } from "@/lib/types";

type Props = {
  camera: CameraFeed;
  onClose: () => void;
};

const ALERT_STYLE: Record<CameraFeed["alertLevel"], string> = {
  good: "bg-primary/10 text-primary-dark border-primary/20",
  meh: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  bad: "bg-critical/10 text-critical border-critical/20",
};

export function CameraDetailPanel({ camera, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = "";
    setStatus("loading");

    const script = document.createElement("script");
    script.className = "video-player-nadaje-com";
    script.setAttribute("data-player-id", camera.playerId);
    script.setAttribute("data-autoplay", "true");
    script.setAttribute("data-muted", "true");
    script.src = "https://player.nadaje.com/video/1.0/embed.min.js";
    script.async = true;
    script.onload = () => setStatus("ready");
    script.onerror = () => setStatus("error");
    host.appendChild(script);

    return () => {
      host.innerHTML = "";
    };
  }, [camera.playerId]);

  return (
    <div className="flex flex-col overflow-hidden rounded border border-outline bg-white shadow-xl">
      <div className="flex items-start justify-between border-b border-outline bg-surface-variant/30 p-4">
        <div className="min-w-0">
          <span className="block font-headline text-[10px] font-bold uppercase tracking-widest text-primary-dark">
            Kamera na żywo
          </span>
          <h2 className="truncate font-headline text-lg font-extrabold text-on-surface">
            {camera.label}
          </h2>
          <p className="mt-0.5 font-mono text-[10px] text-on-surface-variant">
            {camera.lat.toFixed(4)}°N, {camera.lon.toFixed(4)}°E
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="material-symbols-outlined text-on-surface-variant hover:text-critical"
        >
          close
        </button>
      </div>

      <div className="relative aspect-video w-full overflow-hidden bg-black">
        <div ref={hostRef} className="absolute inset-0" />
        {status === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-headline text-xs uppercase tracking-widest text-white/70">
            Ładowanie feedu...
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/80 p-4 text-center font-headline text-[11px] text-white/80">
            <span className="material-symbols-outlined text-base">error</span>
            Nie udało się załadować playera.
            <a
              href={camera.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Otwórz stronę kamery
            </a>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 p-4">
        <span
          className={`rounded border px-2 py-1 font-headline text-[10px] font-bold uppercase ${ALERT_STYLE[camera.alertLevel]}`}
        >
          {camera.alertText}
        </span>
        <a
          href={camera.pageUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 font-headline text-[11px] font-semibold text-primary-dark hover:underline"
        >
          Otwórz w nowej karcie
          <span className="material-symbols-outlined text-sm">open_in_new</span>
        </a>
      </div>
    </div>
  );
}
