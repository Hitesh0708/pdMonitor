"use client";

import dynamic from "next/dynamic";

// The dashboard uses chart libs (Highcharts/ApexCharts via design-sdk) that
// access `document` at module-eval time, so it must load client-only.
const PdDashboard = dynamic(() => import("@/components/PdDashboard").then((m) => m.PdDashboard), {
  ssr: false,
});

export default function Home() {
  return <PdDashboard />;
}
