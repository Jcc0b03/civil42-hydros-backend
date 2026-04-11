'use client';

import { useEffect, useState } from 'react';
import type { ApiHospital, ApiHospitalListResponse, ApiStats } from './types';

const API_BASE = '/api/szpitale';

export function useHospitals() {
  const [hospitals, setHospitals] = useState<ApiHospital[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/hospitals`);
        const json: ApiHospitalListResponse = await r.json();
        if (!cancelled) setHospitals(json.hospitals ?? []);
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

  return { hospitals, loading };
}

export function useHospitalStats() {
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/stats`);
        const json: ApiStats = await r.json();
        if (!cancelled) setStats(json);
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

  return { stats, loading };
}
