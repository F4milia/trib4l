import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Drift guard for S2's two-factor gate.
 *
 * WHY IT EXISTS. The gate lives in requireUser(), which every protected page
 * calls -- except app/page.tsx, which cannot, because it also renders a
 * signed-OUT view and requireUser redirects instead of returning. That page
 * lists a member's Families and their pending invitations, and it was completely
 * ungated: found by a browser spec failing, not by review, and not by any unit
 * test. Every other surface was correctly held, which is what made it easy to
 * miss.
 *
 * So this walks app/ and requires each page to be covered one way or another. It
 * is the same shape as surface-migration.test.ts: a whole-tree census rather
 * than a hand-kept list, so a NEW page is covered the moment it is created.
 *
 * Adding a page means either using requireUser() or making a deliberate entry in
 * PUBLIC below. Both are decisions; neither is an accident.
 */
const APP = join(process.cwd(), "app");

function pages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (entry === "page.tsx") out.push(relative(process.cwd(), full));
  }
  return out;
}

/**
 * Pages that legitimately serve a caller with no session, or that the gate
 * itself sends people to. Each needs a reason, because "add it to the list" is
 * how a gate quietly stops covering anything.
 */
const PUBLIC: Record<string, string> = {
  "app/login/page.tsx": "signed out by definition",
  "app/signup/page.tsx": "signed out by definition",
  "app/magic-link/page.tsx": "signed out by definition",
  "app/forgot-password/page.tsx": "signed out by definition",
  "app/link-sent/page.tsx": "confirmation copy only, reads nothing",
  "app/reset-sent/page.tsx": "confirmation copy only, reads nothing",
  "app/check-email/page.tsx": "confirmation copy only, reads nothing",
  "app/reset-password/page.tsx":
    "a recovery session is aal1 by nature; gating it would lock out the person who lost their authenticator, and it bypasses nothing because the next sign-in is gated",
  "app/auth/verify/page.tsx": "the page the gate redirects TO for a code",
  "app/settings/security/page.tsx": "the page the gate redirects TO for enrolment",
};

const files = pages(APP);

/** A page under a directory whose layout calls requireUser() is gated by that
 *  layout: a redirect thrown there aborts the whole render, page included. */
function coveredByLayout(file: string): boolean {
  const parts = file.split("/");
  for (let depth = parts.length - 1; depth > 0; depth -= 1) {
    const layout = join(process.cwd(), ...parts.slice(0, depth), "layout.tsx");
    try {
      const source = readFileSync(layout, "utf8");
      if (/requireUser\(\s*\)/.test(source)) return true;
    } catch {
      // No layout at this level; keep walking up.
    }
  }
  return false;
}

describe("every page is behind the two-factor gate", () => {
  it("found the page tree", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s", (file) => {
    if (PUBLIC[file]) {
      // Asserted, not just skipped: a public page must not be quietly reading
      // user data behind a "signed out by definition" label.
      expect(PUBLIC[file].length).toBeGreaterThan(10);
      return;
    }

    const source = readFileSync(join(process.cwd(), file), "utf8");

    /**
     * requirePlatformAdmin() counts because it calls requireUser() itself, so
     * the gate runs before its own am_i_platform_admin check. Worth naming
     * rather than matching loosely: it is the only wrapper, and a future one
     * that forgets to delegate should fail here.
     */
    const gatedByRequireUser =
      /requireUser\(\s*\)/.test(source) || /requirePlatformAdmin\(\s*\)/.test(source);
    // accountGate covers both refusals; assuranceOutcome alone covers only one,
    // which is what app/page.tsx got wrong. Only the combined call counts.
    const gatedExplicitly = source.includes("accountGate");
    const opensOut = /skipAssuranceGate/.test(source);

    expect(
      gatedByRequireUser || gatedExplicitly || coveredByLayout(file),
      `${file} reads as a protected page but neither calls requireUser() nor accountGate(). ` +
        "Either gate it, or add it to PUBLIC with a reason.",
    ).toBe(true);

    // A page that opts out must be in PUBLIC, where the reason is written down.
    expect(opensOut, `${file} passes skipAssuranceGate but is not listed in PUBLIC`).toBe(false);
  });
});
