import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/.temp/**",
    "lib/supabase/database.types.ts",
    // `.claude/worktrees/` holds full checkouts of this repo, so linting the
    // root lints every other stream's branch: 1809 files and 5323 errors that
    // belong to no reviewable diff, against 214 of our own with none. Same
    // root cause as vitest's collection problem -- a worktree inside the repo
    // is inside every path that is not excluded. See CLAUDE.md, 2026-09-02.
    ".claude/**",
  ]),
]);

export default eslintConfig;
