import { test, expect, type ConsoleMessage, type Request } from "@playwright/test";
import fs from "node:fs";

const SHOTS = "screenshots";
fs.mkdirSync(SHOTS, { recursive: true });

/** Read the dev JWT from .env.local for the TokenGate test. */
function readEnvToken(): string {
  const env = fs.readFileSync(".env.local", "utf8");
  const line = env.split("\n").find((l) => l.startsWith("IOSENSE_BEARER_TOKEN="));
  return line ? line.slice("IOSENSE_BEARER_TOKEN=".length).trim() : "";
}

// Console noise we don't care about (highcharts accessibility hint, favicon, etc.)
const IGNORE = [/Highcharts.*accessibility/i, /favicon/i, /Download the React DevTools/i];

test("PD dashboard renders real IOsense data across all 3 modes + both views", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const apiCalls: string[] = [];

  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && !IGNORE.some((re) => re.test(m.text()))) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("request", (r: Request) => {
    const u = r.url();
    if (u.includes("getWidgetData")) apiCalls.push("getWidgetData");
    else if (u.includes("getAutoDownSampledData")) apiCalls.push("getAutoDownSampledData");
    else if (u.includes("getLastDPsofDevicesAndSensor")) apiCalls.push("getLastDPs");
  });

  // ── Default: 1-day avg / By location ──────────────────────────────────
  await page.goto("/");
  // Real data renders as Highcharts <path class="highcharts-graph">.
  await page.waitForSelector(".highcharts-graph", { timeout: 60_000 });
  await expect(page.getByText("By location")).toBeVisible(); // control bar present (page title is host-supplied)
  await page.waitForTimeout(1500); // let all cards settle
  await page.screenshot({ path: `${SHOTS}/01-day-bylocation.png`, fullPage: true });

  let graphs = await page.locator(".highcharts-graph").count();
  expect(graphs, "1-day view should render real series").toBeGreaterThan(0);
  expect(apiCalls).toContain("getWidgetData");
  expect(apiCalls).toContain("getLastDPs");

  // Stale Alpha2 (last data ~2026-05-29, before This-month range) → prominent stale badge.
  await expect(page.getByText(/data stale/i).first()).toBeVisible();
  // Supervisor KPI cards present.
  await expect(page.getByText("Sensor Status")).toBeVisible();

  // ── 15-min avg (today) ────────────────────────────────────────────────
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("getAutoDownSampledData"), { timeout: 60_000 }),
    page.getByText("15-min avg", { exact: true }).click(),
  ]);
  await page.waitForSelector(".highcharts-graph", { timeout: 60_000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/02-15min-bylocation.png`, fullPage: true });
  graphs = await page.locator(".highcharts-graph").count();
  expect(graphs, "15-min view should render real series").toBeGreaterThan(0);
  expect(apiCalls).toContain("getAutoDownSampledData");

  // ── 7-day avg (this year, Monday-aligned) ─────────────────────────────
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("getWidgetData"), { timeout: 60_000 }),
    page.getByText("7-day avg", { exact: true }).click(),
  ]);
  await page.waitForSelector(".highcharts-graph", { timeout: 60_000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/03-7day-bylocation.png`, fullPage: true });
  expect(await page.locator(".highcharts-graph").count()).toBeGreaterThan(0);
  // Week buckets must NOT use intra-day time labels (regression guard).
  await expect(page.locator(".highcharts-xaxis-labels").first()).not.toContainText("01:45");

  // ── Compare locations (one signal, all 4 overlaid) ────────────────────
  await page.getByRole("button", { name: "Compare locations" }).click();
  await page.waitForSelector(".highcharts-graph", { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/04-7day-compare.png`, fullPage: true });
  // Compare overlays 4 location series on a single chart.
  await expect(page.getByText(/all locations/).first()).toBeVisible();

  // ── No uncaught errors ────────────────────────────────────────────────
  expect(pageErrors, `pageerrors:\n${pageErrors.join("\n")}`).toHaveLength(0);
  expect(consoleErrors, `console errors:\n${consoleErrors.join("\n")}`).toHaveLength(0);

  console.log("API calls observed:", [...new Set(apiCalls)].join(", "));
});

test("TokenGate prompts for a token when none auto-resolves, then loads data", async ({ page }) => {
  // Simulate the deployed/undeployed-without-portal case: no dev fallback, no stored token.
  await page.route("**/api/dev-token", (r) => r.fulfill({ status: 404 }));
  await page.addInitScript(() => localStorage.removeItem("bearer_token"));

  await page.goto("/");
  await expect(page.getByText("Connect to IOsense")).toBeVisible({ timeout: 30_000 });

  // Paste the dev JWT and connect.
  const token = readEnvToken();
  expect(token, "dev token present in .env.local").not.toEqual("");
  await page.locator("textarea").fill(token);
  await page.getByRole("button", { name: /Connect/ }).click();

  // After connecting, the dashboard renders real data.
  await page.waitForSelector(".highcharts-graph", { timeout: 60_000 });
  await expect(page.getByText("By location")).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/05-token-gate-connected.png`, fullPage: true });
});
