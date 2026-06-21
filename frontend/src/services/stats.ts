/**
 * Derived metrics for the PD dashboard: per-location summaries (latest / max /
 * trend / severity), staleness, and supervisor KPIs. Pure functions — no I/O.
 */

import type { ChartPlotLine } from "@faclon-labs/design-sdk";
import { PD_LOCATIONS, SIGNAL_KINDS, SIGNAL_META, THRESHOLDS, seriesKey, type SignalKind } from "@/config/pdLocations";
import type { PdDataset } from "@/services/bucketing";
import type { LastDP } from "@/services/iosenseClient";

export type Severity = "normal" | "warning" | "critical" | "stale";
export type Trend = "rising" | "stable" | "falling";

/** Hex palette for chart/swatch use (aligns with the severity scheme). */
export const SEVERITY_HEX: Record<Severity, string> = {
  normal: "#2f9e44",
  warning: "#f08c00",
  critical: "#e03131",
  stale: "#868e96",
};

/** design-sdk Badge/Indicator color for a severity. */
export const SEVERITY_BADGE: Record<Severity, "Positive" | "Notice" | "Negative" | "Neutral"> = {
  normal: "Positive",
  warning: "Notice",
  critical: "Negative",
  stale: "Neutral",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  normal: "Normal",
  warning: "Warning",
  critical: "Critical",
  stale: "Stale",
};

export const TREND_ARROW: Record<Trend, string> = { rising: "▲", stable: "▬", falling: "▼" };

const STALE_HOURS = 24;

function nums(vals: (number | null)[]): number[] {
  return vals.filter((v): v is number => v != null && Number.isFinite(v));
}
function mean(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / a.length;
}

export function lastNonNull(vals: (number | null)[]): number | null {
  for (let i = vals.length - 1; i >= 0; i--) {
    const v = vals[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}
export function maxOf(vals: (number | null)[]): number | null {
  const n = nums(vals);
  return n.length ? Math.max(...n) : null;
}

/** Relative change between the first and last third of the series. */
export function trendInfo(vals: (number | null)[]): { trend: Trend; deltaPct: number } {
  const n = nums(vals);
  if (n.length < 4) return { trend: "stable", deltaPct: 0 };
  const h = Math.max(1, Math.floor(n.length / 3));
  const first = mean(n.slice(0, h));
  const last = mean(n.slice(-h));
  const base = Math.abs(first) || 1;
  const deltaPct = ((last - first) / base) * 100;
  const trend: Trend = deltaPct > 5 ? "rising" : deltaPct < -5 ? "falling" : "stable";
  return { trend, deltaPct };
}

export function severityFor(kind: SignalKind, value: number | null, stale: boolean): Severity {
  if (stale || value == null) return "stale";
  const t = THRESHOLDS[kind];
  if (value >= t.critical) return "critical";
  if (value >= t.caution) return "warning";
  return "normal";
}

export interface StaleInfo {
  stale: boolean;
  hasData: boolean;
  ageMs: number | null;
  ageLabel: string; // e.g. "2 min", "23 days", "—"
}

export function staleInfo(lastTime: string | null | undefined, nowMs: number | null): StaleInfo {
  if (!lastTime || nowMs == null) return { stale: true, hasData: false, ageMs: null, ageLabel: "—" };
  const ageMs = nowMs - new Date(lastTime).getTime();
  return { stale: ageMs > STALE_HOURS * 3.6e6, hasData: true, ageMs, ageLabel: humanAge(ageMs) };
}

export function humanAge(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} days`;
}

export interface SignalSummary {
  kind: SignalKind;
  latest: number | null;
  max: number | null;
  trend: Trend;
  deltaPct: number;
  severity: Severity;
}

export interface LocationSummary {
  id: string;
  name: string;
  stale: StaleInfo;
  ultrasound: SignalSummary;
  tev: SignalSummary;
  /** Worst severity across both signals — drives the card status badge. */
  worst: Severity;
}

const SEV_RANK: Record<Severity, number> = { stale: 0, normal: 1, warning: 2, critical: 3 };

function summarizeSignal(kind: SignalKind, vals: (number | null)[], stale: boolean): SignalSummary {
  const latest = lastNonNull(vals);
  const { trend, deltaPct } = trendInfo(vals);
  return { kind, latest, max: maxOf(vals), trend, deltaPct, severity: severityFor(kind, latest, stale) };
}

export function summarizeLocations(
  dataset: PdDataset | null,
  lastDPByPair: Record<string, LastDP>,
  nowMs: number | null,
): LocationSummary[] {
  return PD_LOCATIONS.map((loc) => {
    const usPair = loc.signals.ultrasound;
    const last = lastDPByPair[`${usPair.devID}__${usPair.sensor}`]?.time ?? null;
    const stale = staleInfo(last, nowMs);
    const usVals = dataset?.values[seriesKey(loc.id, "ultrasound")] ?? [];
    const tevVals = dataset?.values[seriesKey(loc.id, "tev")] ?? [];
    const ultrasound = summarizeSignal("ultrasound", usVals, stale.stale);
    const tev = summarizeSignal("tev", tevVals, stale.stale);
    const worst = [ultrasound.severity, tev.severity].reduce((a, b) => (SEV_RANK[b] > SEV_RANK[a] ? b : a), "normal" as Severity);
    return { id: loc.id, name: loc.name, stale, ultrasound, tev, worst: stale.stale ? "stale" : worst };
  });
}

export interface KpiSummary {
  highestUltrasound: { name: string; value: number | null; severity: Severity } | null;
  highestTev: { name: string; value: number | null; severity: Severity } | null;
  fastestRising: { name: string; deltaPct: number; kind: SignalKind } | null;
  staleCount: number;
  /** Health classification of ONLINE assets — healthy + warning + critical = online. */
  health: { healthy: number; warning: number; critical: number; online: number };
}

export function computeKpis(summaries: LocationSummary[]): KpiSummary {
  const live = summaries.filter((s) => !s.stale.stale);

  const topBy = (pick: (s: LocationSummary) => SignalSummary) => {
    const ranked = live
      .map((s) => ({ name: s.name, sig: pick(s) }))
      .filter((x) => x.sig.latest != null)
      .sort((a, b) => (b.sig.latest! - a.sig.latest!));
    return ranked[0] ? { name: ranked[0].name, value: ranked[0].sig.latest, severity: ranked[0].sig.severity } : null;
  };

  // Fastest rising across either signal.
  let fastest: KpiSummary["fastestRising"] = null;
  for (const s of live) {
    for (const k of SIGNAL_KINDS) {
      const d = s[k].deltaPct;
      if (!fastest || d > fastest.deltaPct) fastest = { name: s.name, deltaPct: d, kind: k };
    }
  }

  // Health of online (non-stale) assets — a location takes its worst signal tag.
  const health = { healthy: 0, warning: 0, critical: 0, online: live.length };
  for (const s of live) {
    if (s.worst === "critical") health.critical++;
    else if (s.worst === "warning") health.warning++;
    else health.healthy++;
  }

  return {
    highestUltrasound: topBy((s) => s.ultrasound),
    highestTev: topBy((s) => s.tev),
    // Top mover regardless of sign — the card decides "rising" vs "stable" (>5%).
    fastestRising: fastest,
    staleCount: summaries.filter((s) => s.stale.stale).length,
    health,
  };
}

/** Format a value with the unit, or an em-dash when null. */
export function fmtVal(v: number | null, unit: string, digits = 2): string {
  return v == null ? "—" : `${v.toFixed(digits)} ${unit}`;
}

/** Caution (amber) + critical (red) reference lines for the given signal(s). */
export function thresholdPlotLines(kinds: SignalKind[]): ChartPlotLine[] {
  const lines: ChartPlotLine[] = [];
  for (const k of kinds) {
    const t = THRESHOLDS[k];
    const tag = kinds.length > 1 ? `${SIGNAL_META[k].shortLabel} ` : "";
    lines.push({ value: t.caution, color: SEVERITY_HEX.warning, dashStyle: "Dash", width: 1, label: `${tag}Caution ${t.caution}` });
    lines.push({ value: t.critical, color: SEVERITY_HEX.critical, dashStyle: "Dash", width: 1, label: `${tag}Critical ${t.critical}` });
  }
  return lines;
}
