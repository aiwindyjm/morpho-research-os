import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration (PRD §16: "Playwright E2E runs against mock workers and
 * providers"). The web server is the apps/desktop Vite dev server; the app
 * boots on the in-memory mock backend (services/transportProvider.ts — mock
 * transport is the default with a ~60ms simulated latency), so every spec is
 * fully offline and never touches a real provider.
 *
 * Port: apps/desktop/vite.config.ts declares no explicit port (the plain
 * `pnpm dev` default is 5173). The E2E run deliberately uses a dedicated
 * port instead: `reuseExistingServer` outside CI trusts whatever answers on
 * the URL, and silently reusing an unrelated dev server that happens to sit
 * on the default port would test the wrong app. With --strictPort the run
 * either owns the port exclusively or fails loudly.
 */

const PORT = 5199;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The mock transport delays every command ~60ms and some journeys chain
  // several views; give individual tests room without masking hangs.
  timeout: 45_000,
  // Serial, single-worker determinism: one dev server, one mock backend per
  // page load, no cross-test interference.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // ADR-023: pin the browser locale to zh-CN so the i18n resolution ladder
    // (localStorage miss → navigator.language) deterministically renders the
    // default language; existing specs assert the Chinese shell text.
    locale: "zh-CN",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], locale: "zh-CN" },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `${BASE_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
