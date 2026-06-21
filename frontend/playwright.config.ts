import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src/tests",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PD_BASE_URL ?? "http://localhost:3006",
    trace: "off",
    screenshot: "off",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
