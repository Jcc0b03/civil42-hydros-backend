"use client";

import { useEffect, useState } from "react";
import type { TerritoryFeatureCollection } from "./types";

type Status = "idle" | "loading" | "ready" | "error";

type TerritoriesState = {
  status: Status;
  powiaty: TerritoryFeatureCollection | null;
  gminy: TerritoryFeatureCollection | null;
  error: string | null;
};

const INITIAL: TerritoriesState = {
  status: "idle",
  powiaty: null,
  gminy: null,
  error: null,
};

export function useTerritories(): TerritoriesState {
  const [state, setState] = useState<TerritoriesState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));

    Promise.all([
      fetch("/geo/lubelskie-powiaty.geojson").then((r) => r.json()),
      fetch("/geo/lubelskie-gminy.geojson").then((r) => r.json()),
    ])
      .then(([powiaty, gminy]) => {
        if (cancelled) return;
        setState({ status: "ready", powiaty, gminy, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({
          status: "error",
          powiaty: null,
          gminy: null,
          error: err.message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
