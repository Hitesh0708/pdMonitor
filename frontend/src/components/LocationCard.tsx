"use client";

import { Badge, Indicator } from "@faclon-labs/design-sdk";
import { SIGNAL_META, UNIT } from "@/config/pdLocations";
import { PdChart } from "@/components/PdChart";
import { SEVERITY_HEX, fmtVal, thresholdPlotLines, type LocationSummary } from "@/services/stats";

interface MetricProps {
  label: string;
  value: string;
  color?: string;
  trendArrow?: string;
}
function Metric({ label, value, color, trendArrow }: MetricProps) {
  return (
    <div className="flex flex-col rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</span>
      <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: color ?? "#212529" }}>
        {value}
        {trendArrow && <span className="text-[10px] text-gray-400">{trendArrow}</span>}
      </span>
    </div>
  );
}

export interface LocationCardProps {
  summary: LocationSummary;
  categories: string[];
  tooltipCategories: string[];
  ultrasoundData: (number | null)[];
  tevData: (number | null)[];
}

export function LocationCard({ summary, categories, tooltipCategories, ultrasoundData, tevData }: LocationCardProps) {
  const { name, stale, ultrasound, tev, worst } = summary;
  const noData = ultrasoundData.every((v) => v == null) && tevData.every((v) => v == null);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-gray-900">{name}</h3>
          {stale.stale ? (
            <Badge color="Negative" emphasis="Intense" size="Small" label={`⚠ Data stale: ${stale.ageLabel} old`} />
          ) : (
            <Indicator intent="Positive" size="Small" label={stale.ageLabel === "just now" ? "Live · just now" : `Live · ${stale.ageLabel} ago`} />
          )}
        </div>
        {!stale.stale && (
          <Badge
            color={worst === "critical" ? "Negative" : worst === "warning" ? "Notice" : "Positive"}
            emphasis="Subtle"
            size="Small"
            label={worst === "critical" ? "Critical" : worst === "warning" ? "Warning" : "Normal"}
          />
        )}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="Ultrasound" value={fmtVal(ultrasound.latest, UNIT)} color={SEVERITY_HEX[ultrasound.severity]} />
        <Metric label="TEV" value={fmtVal(tev.latest, UNIT)} color={SEVERITY_HEX[tev.severity]} />
        <Metric label="Max US / TEV" value={`${fmtVal(ultrasound.max, "", 1)} / ${fmtVal(tev.max, "", 1)}`} />
        <Metric label="Trend (US)" value={ultrasound.trend} />
      </div>

      {/* Single chart with both signals — click the legend to show/hide a series. */}
      {noData ? (
        <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
          No data in selected range
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <PdChart
            bare
            showLegend={false}
            nativeLegend
            height={300}
            categories={categories}
            tooltipCategories={tooltipCategories}
            series={[
              { name: SIGNAL_META.ultrasound.shortLabel, data: ultrasoundData, color: SIGNAL_META.ultrasound.color },
              { name: SIGNAL_META.tev.shortLabel, data: tevData, color: SIGNAL_META.tev.color },
            ]}
            plotLines={thresholdPlotLines(["ultrasound"])}
          />
        </div>
      )}
    </div>
  );
}
