"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PD_LOCATIONS,
  SIGNAL_KINDS,
  allDevSensorPairs,
  seriesKey,
} from "@/config/pdLocations";
import {
  getAutoDownSampledRaw,
  getLastDPs,
  getWidgetDataBucketed,
  IOsenseError,
  type LastDP,
  type WidgetConfig,
} from "@/services/iosenseClient";
import {
  bucket15min,
  dayBounds,
  daySpanBounds,
  shapeWidgetData,
  weekSpanBounds,
  type PdDataset,
} from "@/services/bucketing";

export type TimeMode = "15min" | "day" | "week";

export interface UsePdDataArgs {
  token: string | null;
  mode: TimeMode;
  /** Single calendar day for 15-min mode. */
  day: Date;
  /** Date span for day/week modes. */
  span: { start: Date; end: Date };
}

export interface UsePdDataResult {
  dataset: PdDataset | null;
  lastDPByPair: Record<string, LastDP>;
  /** Epoch ms captured when the data was fetched — used for staleness display. */
  fetchedAtMs: number | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** seriesKey for every (location, signal) — the 8 expected keys. */
const EXPECTED_KEYS: string[] = PD_LOCATIONS.flatMap((loc) => SIGNAL_KINDS.map((k) => seriesKey(loc.id, k)));

/** `${devID}__${sensor}` → seriesKey, used to re-tag raw downsampled series. */
const PAIR_TO_KEY: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const loc of PD_LOCATIONS) {
    for (const k of SIGNAL_KINDS) {
      const s = loc.signals[k];
      m[`${s.devID}__${s.sensor}`] = seriesKey(loc.id, k);
    }
  }
  return m;
})();

/** getWidgetData config: one entry per (location, signal), key = seriesKey. */
const WIDGET_CONFIG: WidgetConfig[] = PD_LOCATIONS.flatMap((loc) =>
  SIGNAL_KINDS.map((k) => {
    const s = loc.signals[k];
    return { type: "device" as const, devID: s.devID, sensor: s.sensor, operator: "mean" as const, key: seriesKey(loc.id, k) };
  }),
);

export function usePdData({ token, mode, day, span }: UsePdDataArgs): UsePdDataResult {
  const [dataset, setDataset] = useState<PdDataset | null>(null);
  const [lastDPByPair, setLastDPByPair] = useState<Record<string, LastDP>>({});
  const [fetchedAtMs, setFetchedAtMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // Stable primitive deps so effect doesn't loop on new Date object identities.
  const dayMs = day.getTime();
  const startMs = span.start.getTime();
  const endMs = span.end.getTime();

  useEffect(() => {
    if (!token) return;
    const id = ++reqId.current;

    const run = async () => {
      setLoading(true);
      setError(null);
      // Drop the previous dataset so stale categories never render under a new
      // mode/range header (e.g. 15-min HH:mm labels under a "7-day" title).
      setDataset(null);
      try {
        let ds: PdDataset;
        if (mode === "15min") {
          const b = dayBounds(new Date(dayMs));
          const raw = await getAutoDownSampledRaw({ token, pairs: allDevSensorPairs(), sTime: b.startMs, eTime: b.endMs });
          ds = bucket15min(raw, b.startMs, PAIR_TO_KEY);
        } else {
          const b = mode === "day" ? daySpanBounds(new Date(startMs), new Date(endMs)) : weekSpanBounds(new Date(startMs), new Date(endMs));
          const res = await getWidgetDataBucketed({ token, startTime: b.startMs, endTime: b.endMs, timeFrame: mode, config: WIDGET_CONFIG });
          ds = shapeWidgetData(res, mode, EXPECTED_KEYS);
        }

        // Latest values (staleness) — non-fatal if it fails.
        let lastMap: Record<string, LastDP> = {};
        try {
          const dps = await getLastDPs(token, allDevSensorPairs());
          lastMap = Object.fromEntries(dps.map((d) => [`${d.devID}__${d.sensor}`, d]));
        } catch {
          /* keep charts even if staleness lookup fails */
        }

        const now = Date.now();
        if (id !== reqId.current) return;
        setDataset(ds);
        setLastDPByPair(lastMap);
        setFetchedAtMs(now);
        setLoading(false);
      } catch (e) {
        if (id !== reqId.current) return;
        const msg = e instanceof IOsenseError ? e.message : `Failed to load PD data: ${(e as Error).message}`;
        setError(msg);
        setLoading(false);
      }
    };

    run();
  }, [token, mode, dayMs, startMs, endMs, nonce]);

  return useMemo(
    () => ({ dataset, lastDPByPair, fetchedAtMs, loading, error, refetch }),
    [dataset, lastDPByPair, fetchedAtMs, loading, error, refetch],
  );
}
