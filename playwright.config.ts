import { defineConfig, devices } from "@playwright/test";

/**
 * Without this file, `npx playwright test` defaults its testDir to the repo
 * root and collects the vitest suites -- which is why the ZeroStep workflow
 * failed at collection with "Vitest cannot be imported in a CommonJS module".
 * testDir is pinned to tests/e2e and testMatch to *.spec.ts so the two test
 * systems cannot see each other's files.
 *
 * These specs exist to make Phase E safe. Restructuring markup across 24
 * surfaces that wire server actions via action={} risks a form that silently
 * stops submitting -- a functional break no unit test or class-level
 * assertion can catch. This is that floor.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false, // one local Supabase instance, real rows -- same reason vitest.isolation.config.mts serialises
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `next dev` rather than build+start: these specs guard behaviour, not
    // production bundling, and ci.yml already proves `next build` succeeds.
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
