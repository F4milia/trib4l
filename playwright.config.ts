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
    /**
     * S2's auth rate limiter allows five attempts per address per fifteen
     * minutes. These specs sign in as the same seeded users once per spec, so
     * from the sixth spec onward every sign-in is refused with "Too many
     * attempts" -- the limiter working correctly against a workload no human
     * produces. Discovered by the suite going red, not predicted.
     *
     * This is the ONLY place the escape is set, and lib/auth/rate-limit.ts
     * ignores it unless NODE_ENV is not "production" -- which `next build` and
     * `next start` pin, so it cannot open on a deployment. The limiter keeps its
     * coverage in pgTAP, the isolation suite and the unit suite.
     */
    env: { AUTH_RATE_LIMIT_DISABLED: "1" },
  },
});
