import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The AI Studio Manager preview serves this app from an external host while
  // `next dev` runs on localhost. Allow that host to load dev/HMR assets,
  // otherwise Next blocks them cross-origin and the page renders blank.
  allowedDevOrigins: ["pdmonitor.iocompute.ai", "*.iocompute.ai"],
  // Multiple lockfiles exist on this machine; pin the workspace root so
  // Turbopack resolves modules and .env from this project.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
