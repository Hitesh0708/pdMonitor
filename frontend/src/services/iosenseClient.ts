/**
 * Browser-side IOsense API layer for the PD dashboard.
 *
 * Three read endpoints:
 *   - getWidgetDataBucketed  → day/week mean aggregation (modes 2 & 3)
 *   - getAutoDownSampledRaw  → raw points for client-side 15-min means (mode 1)
 *   - getLastDPs             → latest value per (devID, sensor) for staleness
 *
 * Auth: Authorization: Bearer <jwt>. The data endpoints do not require the
 * `organisation` header (verified). Errors (HTTP !ok OR success:false) throw
 * `IOsenseError` so the UI can surface a retry.
 */

import { TZ } from "@/config/pdLocations";

const BASE = "https://connector.iosense.io/api/account";

export class IOsenseError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "IOsenseError";
    this.status = status;
  }
}

/** Normalize a stored token (may or may not carry the "Bearer " prefix). */
function authHeader(token: string): string {
  const t = token.trim();
  return /^bearer\s/i.test(t) ? t : `Bearer ${t}`;
}

async function apiFetch<T>(path: string, token: string | null | undefined, body: unknown): Promise<T> {
  if (!token) throw new IOsenseError(401, "Not authenticated. Open this dashboard from the IOsense portal.");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "PUT",
      headers: {
        Authorization: authHeader(token),
        "Content-Type": "application/json",
        "ngsw-bypass": "true",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    throw new IOsenseError(0, `Network error reaching IOsense: ${(e as Error).message}`);
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* empty body */
  }

  const failed = !res.ok || (parsed && typeof parsed === "object" && (parsed as { success?: boolean }).success === false);
  if (failed) {
    const errs = (parsed as { errors?: unknown[] } | null)?.errors;
    const firstErr = Array.isArray(errs) ? errs.find((x) => typeof x === "string") : undefined;
    const message =
      (firstErr as string) ??
      (parsed as { message?: string } | null)?.message ??
      (res.status === 401 ? "IOsense session expired — re-open from the portal." : `IOsense request failed (HTTP ${res.status})`);
    throw new IOsenseError(res.ok ? 401 : res.status, message);
  }
  return parsed as T;
}

/* ── getWidgetData ──────────────────────────────────────────────────────── */

export type Operator = "mean" | "sum" | "min" | "max";
export type WidgetTimeFrame = "day" | "week";

export interface WidgetConfig {
  type: "device";
  devID: string;
  sensor: string;
  operator: Operator;
  key: string;
}

export interface GetWidgetDataRow {
  type: string;
  devID: string;
  sensor: string;
  operator: string;
  key: string;
  data: string | number | null;
}

export interface GetWidgetDataResponse {
  success: boolean;
  data: {
    data: Record<string, Record<string, GetWidgetDataRow[]>>;
    labelConfig?: Record<string, Record<string, string>>;
  };
  errors?: string[];
}

const TIME_BUCKET: Record<WidgetTimeFrame, string[]> = {
  day: ["year", "month", "day"],
  week: ["year", "month", "week"],
};

export function getWidgetDataBucketed(args: {
  token: string | null;
  startTime: number;
  endTime: number;
  timeFrame: WidgetTimeFrame;
  config: WidgetConfig[];
}): Promise<GetWidgetDataResponse> {
  const body = {
    startTime: args.startTime,
    endTime: args.endTime,
    timezone: TZ,
    timeBucket: TIME_BUCKET[args.timeFrame],
    timeFrame: args.timeFrame,
    type: "combinedBarLineChartV2",
    cycleTime: "00:00",
    weekStart: 1, // Monday-aligned weeks (only relevant for timeFrame "week")
    config: args.config,
  };
  return apiFetch<GetWidgetDataResponse>("/ioLensWidget/getWidgetData", args.token, body);
}

/* ── getAutoDownSampledData (raw points) ────────────────────────────────── */

export interface RawSeries {
  devID: string;
  sensor: string;
  data: Record<string, number | string | null>;
}

interface GetAutoDownSampledResponse {
  success: boolean;
  data: RawSeries[];
  errors?: string[];
}

export async function getAutoDownSampledRaw(args: {
  token: string | null;
  pairs: { devID: string; sensor: string }[];
  sTime: number;
  eTime: number;
}): Promise<RawSeries[]> {
  const body = {
    devConfig: args.pairs.map((p) => ({ devID: p.devID, sensor: p.sensor, sTime: args.sTime, eTime: args.eTime, downscale: 1 })),
  };
  const res = await apiFetch<GetAutoDownSampledResponse>("/widget/getAutoDownSampledData", args.token, body);
  return res.data ?? [];
}

/* ── getLastDPs (latest value per pair) ─────────────────────────────────── */

export interface LastDP {
  devID: string;
  sensor: string;
  time: string;
  value: number;
  unit?: string;
}

interface GetLastDPsResponse {
  success: boolean;
  data: LastDP[];
  errors?: string[];
}

export async function getLastDPs(token: string | null, pairs: { devID: string; sensor: string }[]): Promise<LastDP[]> {
  const res = await apiFetch<GetLastDPsResponse>("/deviceData/getLastDPsofDevicesAndSensorProcessed", token, { devices: pairs });
  return res.data ?? [];
}
