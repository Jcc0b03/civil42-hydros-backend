'use client';

import { useEffect, useState } from 'react';
import type { FloodHospitalsResponse, HydroStation } from './types';

const API_BASE = '/api/szpitale';

export function useHydroStations() {
  const [data, setData] = useState<HydroStation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/hydro`);
        if (!r.ok) throw new Error('not ok');
        const json = await r.json();
        if (!cancelled && Array.isArray(json)) setData(json);
      } catch {
        /* API unavailable – keep empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
        const r = await fetch(`${API_BASE}/flood-hospitals`);
        if (!r.ok) throw new Error('not ok');
        const json: FloodHospitalsResponse = await r.json();
        if (!cancelled && json?.summary && Array.isArray(json?.hospitals))
          setData(json);
      } catch {
        /* API unavailable */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}
