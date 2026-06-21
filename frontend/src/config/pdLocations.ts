/**
 * Static domain config for the Partial Discharge (PD) monitoring dashboard.
 *
 * Per IOsense, a "dashboard" has hardcoded config (no CRUD). This file is the
 * single source of truth for the 4 PD locations, their two signals, units,
 * colors, and alarm thresholds.
 *
 * Signals:
 *   - Ultrasound = INTERNAL partial discharge
 *   - TEV        = EXTERNAL partial discharge
 * Both are measured in mV dB. Data is addressed by (devID, sensor) pairs.
 */

export type SignalKind = "ultrasound" | "tev";

export interface PdSignal {
  kind: SignalKind;
  /** Human label, e.g. "Ultrasound (Internal PD)" */
  label: string;
  /** Short label for compact legends, e.g. "Ultrasound" */
  shortLabel: string;
  devID: string;
  sensor: string;
}

export interface PdLocation {
  /** Stable id — unique even when two locations share a devID (Alpha2 in/out). */
  id: string;
  name: string;
  devID: string;
  signals: Record<SignalKind, PdSignal>;
}

/** Unit label for the Y axis. The API returns unit "." (none configured). */
export const UNIT = "mV dB";

/** Timezone all bucketing/boundaries are computed in. */
export const TZ = "Asia/Calcutta";

/** The 4 PD monitoring locations (verified live against the IOsense API). */
export const PD_LOCATIONS: PdLocation[] = [
  {
    id: "alpha2_in",
    name: "Alpha2 (Incoming)",
    devID: "QTSCM_C1",
    signals: {
      ultrasound: { kind: "ultrasound", label: "Ultrasound (Internal PD)", shortLabel: "Ultrasound", devID: "QTSCM_C1", sensor: "D44" },
      tev: { kind: "tev", label: "TEV (External PD)", shortLabel: "TEV", devID: "QTSCM_C1", sensor: "D45" },
    },
  },
  {
    id: "alpha2_out",
    name: "Alpha2 (Outgoing)",
    devID: "QTSCM_C1",
    signals: {
      ultrasound: { kind: "ultrasound", label: "Ultrasound (Internal PD)", shortLabel: "Ultrasound", devID: "QTSCM_C1", sensor: "D96" },
      tev: { kind: "tev", label: "TEV (External PD)", shortLabel: "TEV", devID: "QTSCM_C1", sensor: "D97" },
    },
  },
  {
    id: "delta2",
    name: "Delta 2",
    devID: "QTSCM_A1",
    signals: {
      ultrasound: { kind: "ultrasound", label: "Ultrasound (Internal PD)", shortLabel: "Ultrasound", devID: "QTSCM_A1", sensor: "D44" },
      tev: { kind: "tev", label: "TEV (External PD)", shortLabel: "TEV", devID: "QTSCM_A1", sensor: "D45" },
    },
  },
  {
    id: "substation_b4",
    name: "Sub Station-B4",
    devID: "QTSCM_B1",
    signals: {
      ultrasound: { kind: "ultrasound", label: "Ultrasound (Internal PD)", shortLabel: "Ultrasound", devID: "QTSCM_B1", sensor: "D44" },
      tev: { kind: "tev", label: "TEV (External PD)", shortLabel: "TEV", devID: "QTSCM_B1", sensor: "D45" },
    },
  },
];

export const SIGNAL_KINDS: SignalKind[] = ["ultrasound", "tev"];

export const SIGNAL_META: Record<SignalKind, { label: string; shortLabel: string; color: string }> = {
  ultrasound: { label: "Ultrasound (Internal PD)", shortLabel: "Ultrasound", color: "#2f6bff" },
  tev: { label: "TEV (External PD)", shortLabel: "TEV", color: "#f5860a" },
};

/** Distinct colors per location for the "compare locations" overlay view. */
export const LOCATION_COLORS: Record<string, string> = {
  alpha2_in: "#2f6bff",
  alpha2_out: "#12b886",
  delta2: "#f5860a",
  substation_b4: "#e8590c",
};

/**
 * Alarm thresholds in mV dB. A parameter is Warning at `caution` ≤ value < `critical`,
 * and Critical at value ≥ `critical`; below `caution` it is Healthy. A location takes
 * the worst tag across its parameters (Ultrasound / TEV).
 *
 * Site spec: Warning ≥ 18 (and < 28), Critical ≥ 28 — applied to both signals.
 */
export interface ThresholdPair {
  caution: number; // Warning level
  critical: number; // Critical level
}
export const THRESHOLDS: Record<SignalKind, ThresholdPair> = {
  ultrasound: { caution: 18, critical: 28 },
  tev: { caution: 18, critical: 28 },
};

/** Stable series key used across data + chart layers. */
export function seriesKey(locationId: string, kind: SignalKind): string {
  return `${locationId}__${kind}`;
}

/** All 8 (devID, sensor) pairs — used for the last-DP / staleness call. */
export function allDevSensorPairs(): { devID: string; sensor: string }[] {
  return PD_LOCATIONS.flatMap((loc) => SIGNAL_KINDS.map((k) => ({ devID: loc.signals[k].devID, sensor: loc.signals[k].sensor })));
}
