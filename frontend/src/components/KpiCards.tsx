"use client";

import { Tooltip } from "@faclon-labs/design-sdk";
import { THRESHOLDS, UNIT } from "@/config/pdLocations";
import { SEVERITY_HEX, fmtVal, type KpiSummary } from "@/services/stats";

const NEUTRAL = "#495057"; // dark/neutral text for non-alert states

interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}
function Kpi({ label, value, sub, accent }: KpiProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm" style={{ borderLeft: `3px solid ${accent}` }}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className="truncate text-lg font-bold leading-tight" style={{ color: accent }} title={value}>
        {value}
      </span>
      {sub && <span className="truncate text-xs text-gray-500">{sub}</span>}
    </div>
  );
}

function HealthKpi({ health, modeLabel }: { health: KpiSummary["health"]; modeLabel: string }) {
  const accent = health.critical > 0 ? SEVERITY_HEX.critical : health.warning > 0 ? SEVERITY_HEX.warning : SEVERITY_HEX.normal;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm" style={{ borderLeft: `3px solid ${accent}` }}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Asset Health</span>
      <span className="whitespace-nowrap text-xs font-bold leading-tight">
        <span style={{ color: SEVERITY_HEX.normal }}>Healthy {health.healthy}</span>
        <span className="text-gray-300"> · </span>
        <span style={{ color: SEVERITY_HEX.warning }}>Warning {health.warning}</span>
        <span className="text-gray-300"> · </span>
        <span style={{ color: SEVERITY_HEX.critical }}>Critical {health.critical}</span>
      </span>
      <ThresholdInfo modeLabel={modeLabel} />
    </div>
  );
}

function ThresholdInfo({ modeLabel }: { modeLabel: string }) {
  const t = THRESHOLDS.ultrasound; // both signals share the same levels
  const body = `Normal 0–${t.caution - 1} · Warning ${t.caution}–${t.critical - 1} · Critical ${t.critical}–40 ${UNIT} · applies separately to Ultrasound and TEV`;
  return (
    <Tooltip heading={`${modeLabel} severity thresholds`} bodyText={body} placement="BottomEnd">
      <span role="button" tabIndex={0} className="cursor-help self-start text-xs text-gray-500 hover:text-gray-700" style={{ color: "#6b7280", fontWeight: 400 }}>
        {modeLabel} thresholds ⓘ
      </span>
    </Tooltip>
  );
}

export function KpiCards({ kpis, totalLocations, modeLabel }: { kpis: KpiSummary; totalLocations: number; modeLabel: string }) {
  const fr = kpis.fastestRising;
  const rising = !!fr && fr.deltaPct > 5;

  const online = kpis.health.online;
  const disconnected = kpis.staleCount;
  const sensorAccent = disconnected === 0 ? SEVERITY_HEX.normal : disconnected > totalLocations / 2 ? SEVERITY_HEX.critical : SEVERITY_HEX.warning;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Highest Ultrasound"
          value={kpis.highestUltrasound ? fmtVal(kpis.highestUltrasound.value, UNIT) : "—"}
          sub={kpis.highestUltrasound?.name ?? "no live data"}
          accent={kpis.highestUltrasound ? SEVERITY_HEX[kpis.highestUltrasound.severity] : SEVERITY_HEX.stale}
        />
        <Kpi
          label="Highest TEV"
          value={kpis.highestTev ? fmtVal(kpis.highestTev.value, UNIT) : "—"}
          sub={kpis.highestTev?.name ?? "no live data"}
          accent={kpis.highestTev ? SEVERITY_HEX[kpis.highestTev.severity] : SEVERITY_HEX.stale}
        />
        {rising ? (
          <Kpi
            label="Fastest Rising"
            value={fr!.name}
            sub={`▲ ${fr!.deltaPct.toFixed(1)}% · ${fr!.kind === "ultrasound" ? "Ultrasound" : "TEV"}`}
            accent={SEVERITY_HEX.warning}
          />
        ) : (
          <Kpi label="Fastest Change" value="Stable" sub="No significant rise" accent={NEUTRAL} />
        )}
        <Kpi
          label="Sensor Status"
          value={`${online} / ${totalLocations} online`}
          sub={disconnected === 0 ? "All sensors connected" : `${disconnected} disconnected`}
          accent={sensorAccent}
        />
        <HealthKpi health={kpis.health} modeLabel={modeLabel} />
    </div>
  );
}
