/**
 * Pure time-series transforms + range builders for the PD dashboard.
 * No network here — unit-testable. All boundaries computed in `TZ`.
 *
 * Output shape is COLUMNAR (`PdDataset`) to feed the design-sdk `LineChart`
 * directly: a shared `categories` array + per-series aligned value arrays.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import isoWeek from "dayjs/plugin/isoWeek";
import { TZ } from "@/config/pdLocations";
import type { RawSeries, GetWidgetDataResponse, WidgetTimeFrame } from "@/services/iosenseClient";

let extended = false;
function ensureDayjs() {
  if (extended) return;
  dayjs.extend(utc);
  dayjs.extend(timezone);
  dayjs.extend(isoWeek);
  extended = true;
}

export interface PdDataset {
  /** X-axis category labels, one per bucket. */
  categories: string[];
  /** Full "start → end" label per bucket, shown in the chart tooltip footer. */
  tooltipCategories: string[];
  /** seriesKey -> values aligned to `categories` (null = gap / no data). */
  values: Record<string, (number | null)[]>;
}

/** Format an epoch-ms boundary in TZ, e.g. "19 Jun 2026 00:15". */
function fmtBoundary(ms: number): string {
  ensureDayjs();
  return dayjs(ms).tz(TZ).format("D MMM YYYY HH:mm");
}

export interface Bounds {
  startMs: number;
  endMs: number;
}

/* ── Range builders (all in TZ) ─────────────────────────────────────────── */

/** Start-of-day in TZ for the calendar Y/M/D of the given Date. */
function tzStartOfDay(d: Date): dayjs.Dayjs {
  ensureDayjs();
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return dayjs.tz(`${ymd} 00:00:00`, TZ);
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function nowTz(): dayjs.Dayjs {
  ensureDayjs();
  return dayjs().tz(TZ);
}

/** Today 00:00 → now (default for 15-min mode). */
export function todayBounds(): Bounds {
  const start = nowTz().startOf("day");
  return { startMs: start.valueOf(), endMs: nowTz().valueOf() };
}

/** Full single calendar day 00:00 → +24h (15-min raw fetch covers the whole day). */
export function dayBounds(day: Date): Bounds {
  const start = tzStartOfDay(day);
  return { startMs: start.valueOf(), endMs: start.add(1, "day").valueOf() };
}

/** This month: 1st 00:00 → now (default for 1-day mode). */
export function thisMonthBounds(): Bounds {
  const start = nowTz().startOf("month");
  return { startMs: start.valueOf(), endMs: nowTz().valueOf() };
}

/** This year: Jan 1 00:00 → now (default for 7-day mode). */
export function thisYearBounds(): Bounds {
  const start = nowTz().startOf("year");
  return { startMs: start.valueOf(), endMs: nowTz().valueOf() };
}

/** Day span from a DatePicker range: start-of-first-day → end-of-last-day. */
export function daySpanBounds(start: Date, end: Date): Bounds {
  const s = tzStartOfDay(start);
  const e = tzStartOfDay(end).add(1, "day");
  return { startMs: s.valueOf(), endMs: e.valueOf() };
}

/** Week span snapped to Monday 00:00 (start) → next Monday after end's week. */
export function weekSpanBounds(start: Date, end: Date): Bounds {
  ensureDayjs();
  const s = tzStartOfDay(start).startOf("isoWeek"); // Monday
  const e = tzStartOfDay(end).startOf("isoWeek").add(1, "week"); // start of week after end's week
  return { startMs: s.valueOf(), endMs: e.valueOf() };
}

/** Generic preset → bounds for the day/week DatePicker presets. */
export function presetBounds(preset: string): Bounds | null {
  const now = nowTz();
  switch (preset) {
    case "this_month":
      return thisMonthBounds();
    case "last_7_days":
      return { startMs: now.subtract(6, "day").startOf("day").valueOf(), endMs: now.valueOf() };
    case "last_30_days":
      return { startMs: now.subtract(29, "day").startOf("day").valueOf(), endMs: now.valueOf() };
    case "last_month": {
      const s = now.subtract(1, "month").startOf("month");
      return { startMs: s.valueOf(), endMs: s.endOf("month").valueOf() };
    }
    case "this_year":
      return thisYearBounds();
    case "last_year": {
      const s = now.subtract(1, "year").startOf("year");
      return { startMs: s.valueOf(), endMs: s.endOf("year").valueOf() };
    }
    case "last_4_weeks":
      return { startMs: now.subtract(4, "week").startOf("isoWeek").valueOf(), endMs: now.valueOf() };
    case "last_8_weeks":
      return { startMs: now.subtract(8, "week").startOf("isoWeek").valueOf(), endMs: now.valueOf() };
    case "last_12_weeks":
      return { startMs: now.subtract(12, "week").startOf("isoWeek").valueOf(), endMs: now.valueOf() };
    default:
      return null;
  }
}

/** Convert Bounds (ms) back to a DatePicker range value for display. */
export function boundsToRange(b: Bounds): { start: Date; end: Date } {
  return { start: new Date(b.startMs), end: new Date(b.endMs) };
}

/** Format a Date in TZ (e.g. "1 Jun 2026"), independent of browser timezone. */
export function fmtTzDate(d: Date): string {
  ensureDayjs();
  return dayjs(d).tz(TZ).format("D MMM YYYY");
}

/* ── 15-minute client-side bucketing (mode 1) ───────────────────────────── */

/**
 * Group raw 30-second points into 96 fixed 15-minute buckets for one calendar
 * day, computing the MEAN per bucket. `pairToKey` maps `${devID}__${sensor}`
 * to a seriesKey so the columnar output indexes uniformly.
 */
export function bucket15min(
  raw: RawSeries[],
  dayStartMs: number,
  pairToKey: Record<string, string>,
): PdDataset {
  ensureDayjs();
  const BUCKET_MS = 15 * 60 * 1000;
  const N = 96;
  const keys = Object.values(pairToKey);

  const sums: Record<string, number[]> = {};
  const counts: Record<string, number[]> = {};
  for (const k of keys) {
    sums[k] = new Array(N).fill(0);
    counts[k] = new Array(N).fill(0);
  }

  for (const series of raw) {
    const key = pairToKey[`${series.devID}__${series.sensor}`];
    if (!key) continue;
    const points = series.data ?? {};
    for (const ts in points) {
      const v = points[ts];
      const num = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(num)) continue;
      const idx = Math.floor((new Date(ts).getTime() - dayStartMs) / BUCKET_MS);
      if (idx < 0 || idx >= N) continue;
      sums[key][idx] += num;
      counts[key][idx] += 1;
    }
  }

  const categories: string[] = [];
  const tooltipCategories: string[] = [];
  for (let i = 0; i < N; i++) {
    const start = dayStartMs + i * BUCKET_MS;
    categories.push(dayjs(start).tz(TZ).format("HH:mm"));
    tooltipCategories.push(`${fmtBoundary(start)} → ${fmtBoundary(start + BUCKET_MS)}`);
  }

  const values: Record<string, (number | null)[]> = {};
  for (const k of keys) {
    values[k] = sums[k].map((s, i) => (counts[k][i] > 0 ? s / counts[k][i] : null));
  }

  return { categories, tooltipCategories, values };
}

/* ── getWidgetData shaping (modes 2 & 3) ────────────────────────────────── */

/**
 * Shape the nested getWidgetData response into a columnar `PdDataset`.
 * We set each config's `key` to the seriesKey, so rows map directly.
 * Buckets are sorted by start-ms; labels come from `labelConfig`.
 */
export function shapeWidgetData(
  res: GetWidgetDataResponse,
  timeFrame: WidgetTimeFrame,
  expectedKeys: string[],
): PdDataset {
  const tf = res.data?.data?.[timeFrame] ?? {};
  const labels = res.data?.labelConfig?.[timeFrame] ?? {};
  const buckets = Object.keys(tf).sort((a, b) => (Number(a.split("-")[0]) || 0) - (Number(b.split("-")[0]) || 0));

  const categories = buckets.map((b) => labels[b] ?? b);
  const tooltipCategories = buckets.map((b) => {
    const [s, e] = b.split("-").map(Number);
    return Number.isFinite(s) && Number.isFinite(e) ? `${fmtBoundary(s)} → ${fmtBoundary(e)}` : (labels[b] ?? b);
  });
  const values: Record<string, (number | null)[]> = {};
  for (const k of expectedKeys) values[k] = [];

  for (const b of buckets) {
    const rows = tf[b] ?? [];
    const byKey: Record<string, number | null> = {};
    for (const r of rows) {
      byKey[r.key] = r.data == null ? null : Number(r.data);
    }
    for (const k of expectedKeys) {
      const v = byKey[k];
      values[k].push(v == null || !Number.isFinite(v) ? null : v);
    }
  }

  return { categories, tooltipCategories, values };
}

/* ── misc ───────────────────────────────────────────────────────────────── */

export function meanOf(xs: (number | null | undefined)[]): number | null {
  const nums = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** True when every series in the dataset is entirely null/empty. */
export function datasetIsEmpty(ds: PdDataset): boolean {
  const keys = Object.keys(ds.values);
  if (!keys.length || !ds.categories.length) return true;
  return keys.every((k) => ds.values[k].every((v) => v == null));
}
