import { describe, expect, it } from "vitest";

import config from "../vitest.config.mts";

// A worktree inside the repository is inside every glob that is not anchored.
//
// `.claude/worktrees/` holds full checkouts of this repo, and vitest's default
// include (`**/*.test.*`) descends into them. Root-anchored excludes like
// "tests/isolation/**" do not match ".claude/worktrees/stream-b/tests/
// isolation/...", so those suites were collected by `npm test` and run against
// the shared Supabase stack -- the other stream's migrations against this
// stream's database.
//
// The failure is invisible in the ordinary way: the run is red, but every
// failing file belongs to a different branch, so reading the output suggests
// this tree is broken when it is not.
const exclude = (config as { test?: { exclude?: string[] } }).test?.exclude ?? [];

describe("vitest collection", () => {
  it("excludes the in-repo worktrees outright", () => {
    expect(exclude).toContain(".claude/**");
  });

  it("anchors every other exclude with **/ so nested checkouts match too", () => {
    const unanchored = exclude.filter(
      (pattern) => pattern !== ".claude/**" && !pattern.startsWith("**/"),
    );
    expect(unanchored).toEqual([]);
  });

  it("still excludes the two suites that must never run under `npm test`", () => {
    // Isolation needs Docker and the shared stack; e2e is Playwright's and
    // throws under another runner. Both exclusions are load-bearing.
    expect(exclude).toContain("**/tests/isolation/**");
    expect(exclude).toContain("**/tests/e2e/**");
  });
});
