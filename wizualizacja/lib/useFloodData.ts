"use client";

import { useEffect, useState } from "react";
import type { FloodHospitalsResponse, HydroStation } from "./types";

const API_BASE = "http://localhost:8000";

export function useHydroStations() {
  const [data, setData] = useState<HydroStation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/hydro`);
        const json = await r.json();
        if (!cancelled) setData(json);
      } catch {
        /* API unavailable – keep empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}

export function useFloodHospitals() {
  const [data, setData] = useState<FloodHospitalsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/flood-hospitals`);
        const json: FloodHospitalsResponse = await r.json();
        if (!cancelled) setData(json);
      } catch {
        /* API unavailable */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
