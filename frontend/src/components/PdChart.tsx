"use client";

import type { ReactNode } from "react";
import { LineChart, type LineSeries, type ChartPlotLine } from "@faclon-labs/design-sdk";
import { UNIT } from "@/config/pdLocations";

export interface PdSeries {
  name: string;
  data: (number | null)[];
  color?: string;
}

export interface PdChartProps {
  title?: ReactNode;
  duration?: string;
  categories: string[];
  /** Full "start → end" labels per point, shown in the tooltip footer. */
  tooltipCategories?: string[];
  series: PdSeries[];
  plotLines?: ChartPlotLine[];
  height?: number;
  showLegend?: boolean;
  /** Use Highcharts' built-in legend (click an item to show/hide that series). */
  nativeLegend?: boolean;
  /** Canvas-only (no Chart card wrapper) — for embedding in custom cards. */
  bare?: boolean;
  status?: "error" | "not-configured";
  onRetry?: () => void;
  actions?: ReactNode;
}

/**
 * Wrapper over the design-sdk `LineChart` (Highcharts). Tuned for readability:
 * tight spacing (less blank area), auto-rotated non-clipping x labels, and an
 * auto-scaled y-axis so small signals (e.g. TEV) don't flatline.
 */
export function PdChart({
  title,
  duration,
  categories,
  tooltipCategories,
  series,
  plotLines,
  height = 300,
  showLegend = true,
  nativeLegend = false,
  bare = false,
  status,
  onRetry,
  actions,
}: PdChartProps) {
  const lineSeries: LineSeries[] = series.map((s) => ({ name: s.name, data: s.data as unknown as number[], color: s.color }));

  return (
    <LineChart
      title={title}
      duration={duration}
      categories={categories}
      tooltipCategories={tooltipCategories}
      series={lineSeries}
      plotLines={plotLines}
      yAxisUnit={UNIT}
      showLegend={showLegend}
      showMarkers={false}
      showInfo={false}
      showSettings={false}
      showMore={false}
      bare={bare}
      status={status}
      onRetry={onRetry}
      actions={actions}
      highchartsOptions={{
        chart: { height, spacingTop: 8, spacingBottom: 6, spacingRight: 18, spacingLeft: 8 },
        accessibility: { enabled: false },
        credits: { enabled: false },
        // Compact, hover-only tooltip (Highcharts default is hover; just shrink it).
        tooltip: {
          shared: true,
          padding: 8,
          borderWidth: 0,
          shadow: true,
          style: { fontSize: "11px" },
          hideDelay: 80,
        },
        legend: {
          enabled: nativeLegend || undefined,
          itemDistance: 18,
          padding: 4,
          margin: 16,
          symbolRadius: 6,
          itemStyle: { fontSize: "11px" },
        },
        xAxis: {
          tickLength: 0,
          lineColor: "#e9ecef",
          // Slant labels automatically when they get crowded (no flat-cram fallback).
          labels: { autoRotation: [-30, -45], style: { fontSize: "10px", color: "#868e96" } },
        },
        yAxis: {
          gridLineColor: "#f1f3f5",
          min: 0, // always start the scale at zero
          startOnTick: true,
          minTickInterval: 1, // never label tick gaps smaller than 1 mV dB
          labels: { style: { fontSize: "10px", color: "#868e96" } },
        },
      }}
    />
  );
}
