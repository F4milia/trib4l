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
    //
    // EVERY PATTERN IS `**/`-PREFIXED, and `.claude/**` is excluded outright.
    // Both matter, and the reason is not obvious: vitest's default *include*
    // is `**/*.test.*`, which reaches into any directory under the root --
    // and `.claude/worktrees/` puts entire checkouts of this repo inside it.
    // With root-anchored excludes, `npm test` collected 146 files from two
    // worktrees, ran their isolation suites, and executed the other stream's
    // migrations against this one's database. It presented as 476 failures in
    // a tree whose own tests all passed. tests/vitest-collection.test.ts
    // guards the shape; see CLAUDE.md, 2026-09-02.
    exclude: [
      "**/node_modules/**",
      "**/tests/isolation/**",
      "**/tests/e2e/**",
      ".claude/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
