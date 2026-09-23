import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the Device Authorization Grant E2E tests.
 *
 * Environment variables (set in .env or in the shell before running):
 *   APP_URL        – Local dev server URL       (default: http://localhost:3000)
 *   TENANT_URL     – IBM Verify tenant base URL
 *   CLIENT_ID      – OAuth client with device_code grant enabled
 *   TEST_USERNAME  – Dedicated test-user username
 *   TEST_PASSWORD  – Dedicated test-user password
 */
export default defineConfig({
  testDir: "./tests/e2e",

  /**
   * 120 s per test — the Device Flow involves multiple round-trips:
   *   • OIDC device authorisation request
   *   • IBM Verify navigation + login + consent
   *   • Token polling (5 s interval, several cycles)
   *   • socket.io notification + redirect
   */
  timeout: 120_000,

  expect: {
    /** Individual assertion timeout. */
    timeout: 15_000,
  },

  /** 1 retry on CI; 0 locally so failures surface immediately. */
  retries: process.env.CI ? 1 : 0,

  /**
   * Serial execution (workers: 1).
   * The server stores tokenSet in node-persist and emits socket.io events to
   * whichever device page is currently connected.  Parallel tests would race.
   */
  workers: 1,

  /** List reporter only — no HTML output needed. */
  reporter: [["list"]],

  use: {
    /** Base URL for the sample application. */
    baseURL: process.env.APP_URL ?? "http://localhost:3000",

    /** Headless Chromium; override with --headed for local debugging. */
    headless: true,

    /**
     * Diagnostics disabled — trace/screenshot/video may capture IBM Verify
     * login pages (credentials visible) on failure. Artifacts are uploaded to
     * GitHub Actions where they could be inspected. Disable entirely in CI.
     * Re-enable locally with: --trace on --video on (never commit that change).
     */
    trace: "off",
    screenshot: "off",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
