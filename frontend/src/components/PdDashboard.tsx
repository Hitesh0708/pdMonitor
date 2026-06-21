"use client";

import { useMemo, useState } from "react";
import { Button, EmptyState, Spinner, NoDataOneIllustration, TechnicalHiccupIllustration } from "@faclon-labs/design-sdk";
import { PD_LOCATIONS, seriesKey, type SignalKind } from "@/config/pdLocations";
import { useAuth } from "@/auth/useAuth";
import { usePdData, type TimeMode } from "@/hooks/usePdData";
import { boundsToRange, datasetIsEmpty, presetBounds, thisMonthBounds, thisYearBounds } from "@/services/bucketing";
import { computeKpis, summarizeLocations } from "@/services/stats";
import { PdControls, type ViewMode } from "@/components/PdControls";
import { KpiCards } from "@/components/KpiCards";
import { LocationCard } from "@/components/LocationCard";
import { CompareView } from "@/components/CompareView";
import { TokenGate } from "@/components/TokenGate";

const MODE_SHORT: Record<TimeMode, string> = { "15min": "15-min", day: "1-day", week: "7-day" };

export function PdDashboard() {
  const { token, loading: authLoading, error: authError, setToken } = useAuth();

  // ── Controls state ────────────────────────────────────────────────────
  const [mode, setMode] = useState<TimeMode>("day");
  const [view, setView] = useState<ViewMode>("byLocation");
  const [signal, setSignal] = useState<SignalKind>("ultrasound");
  const [day, setDay] = useState<Date>(() => new Date());
  const [daySpan, setDaySpan] = useState(() => boundsToRange(thisMonthBounds()));
  const [weekSpan, setWeekSpan] = useState(() => boundsToRange(thisYearBounds()));
  const [dayPreset, setDayPreset] = useState("this_month");
  const [weekPreset, setWeekPreset] = useState("this_year");

  const activeSpan = mode === "week" ? weekSpan : daySpan;
  const activePreset = mode === "week" ? weekPreset : dayPreset;

  const { dataset, lastDPByPair, fetchedAtMs, loading, error, refetch } = usePdData({ token, mode, day, span: activeSpan });

  const summaries = useMemo(() => summarizeLocations(dataset, lastDPByPair, fetchedAtMs), [dataset, lastDPByPair, fetchedAtMs]);
  const kpis = useMemo(() => computeKpis(summaries), [summaries]);

  // ── Control handlers ──────────────────────────────────────────────────
  const onPresetChange = (value: string) => {
    const b = presetBounds(value);
    if (!b) return;
    if (mode === "week") {
      setWeekSpan(boundsToRange(b));
      setWeekPreset(value);
    } else {
      setDaySpan(boundsToRange(b));
      setDayPreset(value);
    }
  };
  const onSpanChange = (r: { start: Date; end: Date }) => {
    if (mode === "week") {
      setWeekSpan(r);
      setWeekPreset("custom");
    } else {
      setDaySpan(r);
      setDayPreset("custom");
    }
  };

  // ── Auth gating ───────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="Large" label="Authenticating…" labelPosition="Right" />
      </div>
    );
  }
  if (!token) {
    // No token auto-resolved (local / undeployed) → let the user paste one.
    // When deployed, the portal supplies ?token= so this never shows.
    return <TokenGate onConnect={setToken} initialError={authError} />;
  }

  // ── Body ──────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (loading && !dataset) {
    body = (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="XLarge" label="Loading PD data…" labelPosition="Right" />
      </div>
    );
  } else if (error) {
    body = (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <EmptyState
          illustration={<TechnicalHiccupIllustration />}
          title="Couldn't load PD data"
          description={error}
          primaryAction={<Button variant="Primary" label="Retry" onClick={refetch} />}
        />
      </div>
    );
  } else if (!dataset || datasetIsEmpty(dataset)) {
    body = (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <EmptyState illustration={<NoDataOneIllustration />} title="No data for this range" description="Try a different date range or time mode." />
      </div>
    );
  } else {
    const ds = dataset;
    // Cards with live data first; stale (offline / old) cards sink to the bottom.
    const orderedSummaries = [...summaries].sort((a, b) => {
      if (a.stale.stale !== b.stale.stale) return a.stale.stale ? 1 : -1;
      return (b.ultrasound.latest ?? -Infinity) - (a.ultrasound.latest ?? -Infinity);
    });
    const viewBody =
      view === "byLocation" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {orderedSummaries.map((s) => (
            <LocationCard
              key={s.id}
              summary={s}
              categories={ds.categories}
              tooltipCategories={ds.tooltipCategories}
              ultrasoundData={ds.values[seriesKey(s.id, "ultrasound")] ?? []}
              tevData={ds.values[seriesKey(s.id, "tev")] ?? []}
            />
          ))}
        </div>
      ) : (
        <CompareView signal={signal} categories={ds.categories} dataset={ds} summaries={summaries} />
      );

    body = (
      <div className="flex flex-col gap-4">
        <KpiCards kpis={kpis} totalLocations={PD_LOCATIONS.length} modeLabel={MODE_SHORT[mode]} />
        {viewBody}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--surface-background,#f5f6f8)]">
      {/* Sticky control bar stays in view while scrolling (page title is supplied by the host platform) */}
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <PdControls
          mode={mode}
          onModeChange={setMode}
          view={view}
          onViewChange={setView}
          signal={signal}
          onSignalChange={setSignal}
          day={day}
          onDayChange={setDay}
          span={activeSpan}
          onSpanChange={onSpanChange}
          preset={activePreset}
          onPresetChange={onPresetChange}
        />
      </div>

      <main className="w-full flex-1 px-6 py-4">{body}</main>
    </div>
  );
}
