"use client";

import type { ReactNode } from "react";
import { DatePicker, SwitchButtonBase, SwitchButtonGroup, Tabs, TabItem } from "@faclon-labs/design-sdk";
import type { TimeMode } from "@/hooks/usePdData";
import type { SignalKind } from "@/config/pdLocations";

export type ViewMode = "byLocation" | "compare";

export interface PdControlsProps {
  mode: TimeMode;
  onModeChange: (m: TimeMode) => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  signal: SignalKind;
  onSignalChange: (s: SignalKind) => void;
  day: Date;
  onDayChange: (d: Date) => void;
  span: { start: Date; end: Date };
  onSpanChange: (r: { start: Date; end: Date }) => void;
  preset: string;
  onPresetChange: (value: string) => void;
}

const MODE_TABS: { value: TimeMode; label: string }[] = [
  { value: "15min", label: "15-min avg" },
  { value: "day", label: "1-day avg" },
  { value: "week", label: "7-day avg" },
];

const DAY_PRESETS = [
  { label: "This month", value: "this_month" },
  { label: "Last 7 days", value: "last_7_days" },
  { label: "Last 30 days", value: "last_30_days" },
  { label: "Last month", value: "last_month" },
  { label: "This year", value: "this_year" },
];

const WEEK_PRESETS = [
  { label: "This year", value: "this_year" },
  { label: "Last 4 weeks", value: "last_4_weeks" },
  { label: "Last 8 weeks", value: "last_8_weeks" },
  { label: "Last 12 weeks", value: "last_12_weeks" },
  { label: "Last year", value: "last_year" },
];

/** A labeled control group — small caption above its control. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="hidden h-11 w-px self-end bg-gray-200 lg:block" />;
}

export function PdControls(props: PdControlsProps) {
  const { mode, onModeChange, view, onViewChange, signal, onSignalChange, day, onDayChange, span, onSpanChange, preset, onPresetChange } = props;

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <Group label="Averaging period">
        <Tabs variant="Filled" size="Medium" value={mode} onChange={(v) => onModeChange(v as TimeMode)}>
          {MODE_TABS.map((t) => (
            <TabItem key={t.value} value={t.value} label={t.label} />
          ))}
        </Tabs>
      </Group>

      <Divider />

      <Group label="View mode">
        <SwitchButtonGroup>
          <SwitchButtonBase type="Text" label="By location" isActive={view === "byLocation"} onClick={() => onViewChange("byLocation")} />
          <SwitchButtonBase type="Text" label="Compare locations" isActive={view === "compare"} onClick={() => onViewChange("compare")} />
        </SwitchButtonGroup>
      </Group>

      {view === "compare" && (
        <Group label="Metric">
          <SwitchButtonGroup>
            <SwitchButtonBase type="Text" label="Ultrasound" isActive={signal === "ultrasound"} onClick={() => onSignalChange("ultrasound")} />
            <SwitchButtonBase type="Text" label="TEV" isActive={signal === "tev"} onClick={() => onSignalChange("tev")} />
          </SwitchButtonGroup>
        </Group>
      )}

      {/* Duration pushed to the right, matching the reference layout. */}
      <div className="ml-auto flex items-end gap-5">
        <Divider />
        <Group label="Duration">
          {mode === "15min" ? (
            <DatePicker mode="single" value={day} onChange={(d) => d && onDayChange(d)} />
          ) : (
            <DatePicker
              mode="range"
              rangeValue={span}
              onRangeChange={(r) => r && onSpanChange(r)}
              presets={mode === "day" ? DAY_PRESETS : WEEK_PRESETS}
              selectedPreset={preset}
              onPresetSelect={onPresetChange}
              showPresetChip
            />
          )}
        </Group>
      </div>
    </div>
  );
}
