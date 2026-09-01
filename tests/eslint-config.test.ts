import { describe, expect, it } from "vitest";

import config from "../eslint.config.mjs";

// The companion of tests/vitest-collection.test.ts. Both tools walk the repo
// root, and `.claude/worktrees/` puts entire checkouts of this repo inside it,
// so both collect another stream's branch unless told not to.
//
// Measured before the ignore was added: 1809 worktree files reporting 5323
// errors, against 214 of this tree's own files reporting none. `npm run lint`
// was red for work that belongs to a different branch.
describe("eslint configuration", () => {
  it("ignores the in-repo worktrees", () => {
    const ignores = config.flatMap((entry) =>
      Array.isArray((entry as { ignores?: string[] }).ignores)
        ? ((entry as { ignores?: string[] }).ignores as string[])
        : [],
    );
    expect(ignores).toContain(".claude/**");
  });
});
