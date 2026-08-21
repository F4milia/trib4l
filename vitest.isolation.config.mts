import { defineConfig } from "vitest/config";

// Separate from vitest.config.mts on purpose: these tests hit a real local
// Supabase instance (Docker) and sign in as seeded users, so they're slower
// and need SUPABASE_URL / SUPABASE_ANON_KEY set. Run via `npm run
// test:isolation`, not `npm test`.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/isolation/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
