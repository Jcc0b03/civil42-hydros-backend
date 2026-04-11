"use client";

import { useEffect, useState } from "react";

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} | ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())} CET`;
}

export function CrisisHeaderCard() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="rounded border border-outline bg-white p-5 shadow-lg">
      <div className="mb-2 flex items-start justify-between">
        <h2 className="font-headline text-lg font-bold leading-tight text-on-surface">
          Crisis Command Center
          <br />
          <span className="text-primary-dark">Lubelskie</span>
        </h2>
        <div className="flex items-center gap-1.5 rounded border border-primary/20 bg-primary/10 px-2 py-0.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary-dark">
            LIVE DATA
          </span>
        </div>
      </div>
      <p className="flex items-center gap-2 font-mono text-[10px] text-on-surface-variant">
        <span className="material-symbols-outlined text-[12px]">schedule</span>
        {now ? formatTimestamp(now) : "\u00A0"}
      </p>
    </div>
  );
}
