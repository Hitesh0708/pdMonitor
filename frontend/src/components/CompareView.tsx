"use client";

import { useState } from "react";
import { Eye, EyeOff } from "react-feather";
import { Badge } from "@faclon-labs/design-sdk";
import { LOCATION_COLORS, PD_LOCATIONS, SIGNAL_META, UNIT, seriesKey, type SignalKind } from "@/config/pdLocations";
import type { PdDataset } from "@/services/bucketing";
import { PdChart } from "@/components/PdChart";
import { SEVERITY_BADGE, SEVERITY_LABEL, fmtVal, thresholdPlotLines, type LocationSummary } from "@/services/stats";

export interface CompareViewProps {
  signal: SignalKind;
  categories: string[];
  dataset: PdDataset;
  summaries: LocationSummary[];
}

export function CompareView({ signal, categories, dataset, summaries }: CompareViewProps) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const meta = SIGNAL_META[signal];

  const series = PD_LOCATIONS.filter((loc) => !hidden.has(loc.id)).map((loc) => ({
    name: loc.name,
    data: dataset.values[seriesKey(loc.id, signal)] ?? [],
    color: LOCATION_COLORS[loc.id],
  }));
  const allHidden = series.length === 0;

  // Ranking: by latest value of the selected signal, descending (nulls last).
  const ranking = [...summaries].sort((a, b) => (b[signal].latest ?? -Infinity) - (a[signal].latest ?? -Infinity));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900">{meta.label} — all locations</h3>
        <div className="h-[300px] w-full">
          <PdChart
            bare
            categories={categories}
            tooltipCategories={dataset.tooltipCategories}
            series={series}
            plotLines={thresholdPlotLines([signal])}
            showLegend={false}
            height={300}
            status={allHidden ? "not-configured" : undefined}
          />
        </div>
      </div>

      {/* Ranking + legend + show/hide panel */}
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold text-gray-900">Ranking — {meta.shortLabel}</h3>
          <span className="text-xs text-gray-400">Highest PD activity · latest value</span>
        </div>
        <div className="flex flex-col gap-1">
          {ranking.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const sev = s.stale.stale ? "stale" : s[signal].severity;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-gray-50"
                style={{ opacity: isHidden ? 0.45 : 1 }}
              >
                <span className="w-4 text-center text-xs font-semibold text-gray-400">{i + 1}</span>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: LOCATION_COLORS[s.id] }} />
                <span className={`flex-1 truncate text-sm ${isHidden ? "text-gray-400 line-through" : "text-gray-800"}`}>{s.name}</span>
                <span className="font-mono text-xs text-gray-600">{fmtVal(s[signal].latest, "", 2)}</span>
                <Badge color={SEVERITY_BADGE[sev]} emphasis="Subtle" size="Small" label={SEVERITY_LABEL[sev]} />
                {isHidden ? <EyeOff size={14} className="text-gray-400" /> : <Eye size={14} className="text-gray-500" />}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Values in {UNIT}. Tap a row to show/hide that location.</p>
      </div>
    </div>
  );
}
