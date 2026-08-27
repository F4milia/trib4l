import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Isolation tests need a live local Supabase instance (Docker) and run
    // under their own config/CI job -- keep them out of the fast default
    // suite so `npm test` never requires Docker.
    //
    // tests/e2e is Playwright's, and the exclusion has to be mutual: its
    // config pins testDir so it cannot see vitest's files, and this keeps
    // vitest from collecting its specs -- `test.describe()` from
    // @playwright/test throws when a non-Playwright runner calls it.
    exclude: ["**/node_modules/**", "tests/isolation/**", "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
