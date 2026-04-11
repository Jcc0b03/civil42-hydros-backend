'use client';

import { useEffect, useState } from 'react';
import type { FloodOverviewResponse, FloodPredictionResponse } from './types';

const API_BASE = '/api/backend';

export function useFloodOverview() {
  const [data, setData] = useState<FloodOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/flood/overview`);
        if (!r.ok) throw new Error('not ok');
        const json: FloodOverviewResponse = await r.json();
        if (!cancelled) setData(json);
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

export function useFloodPrediction() {
  const [data, setData] = useState<FloodPredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/flood/prediction`);
        if (!r.ok) throw new Error('not ok');
        const json: FloodPredictionResponse = await r.json();
        if (!cancelled) setData(json);
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
