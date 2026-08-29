import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIRMABLE_TYPES, confirmableType, safeNext } from "@/lib/auth/confirm";

const root = process.cwd();
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");
const TEMPLATE_DIR = "supabase/templates";
const templates = readdirSync(join(root, TEMPLATE_DIR)).filter((f) => f.endsWith(".html"));

/* -------------------------------------------------------------------------- */
/* The verification gate is on                                                */
/* -------------------------------------------------------------------------- */

describe("email confirmation is enforced by configuration", () => {
  /**
   * The whole S1 acceptance criterion "unverified accounts cannot reach any
   * Family data" rests on this one line: with it, GoTrue mints no session for
   * an unconfirmed address, so there is no credential to reach anything with.
   * tests/isolation/email-verification.test.ts proves the behaviour against a
   * real GoTrue; this proves the setting cannot be flipped back unnoticed.
   */
  it("sets enable_confirmations in the [auth.email] block", () => {
    const block = config.slice(config.indexOf("[auth.email]"), config.indexOf("[auth.sms]"));
    expect(block).toMatch(/^\s*enable_confirmations\s*=\s*true\s*$/m);
    expect(block).not.toMatch(/^\s*enable_confirmations\s*=\s*false\s*$/m);
  });

  it("registers a confirmation template that exists on disk", () => {
    expect(config).toMatch(/\[auth\.email\.template\.confirmation\]/);
    const path = config.match(/\[auth\.email\.template\.confirmation\][\s\S]*?content_path\s*=\s*"([^"]+)"/)?.[1];
    expect(path).toBeTruthy();
    expect(() => readFileSync(join(root, path!.replace(/^\.\//, "")), "utf8")).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Invariant 3 — no Family content leaves the platform                        */
/* -------------------------------------------------------------------------- */

/**
 * These scan the WHOLE template file, comments included, which is why the
 * templates carry only a one-line pointer back here instead of their own
 * rationale. The first draft explained the rules inside the file and the guard
 * fired on its own documentation -- the same failure as CLAUDE.md's 2026-08-30
 * entry ("the content guard fired on its own output"). Excluding comments from
 * the scan would have fixed the symptom and opened a hole, since an HTML
 * comment is still transmitted; moving the prose to the test that enforces it
 * closes both.
 */
describe.each(templates)("%s", (file) => {
  const html = readFileSync(join(root, TEMPLATE_DIR, file), "utf8");

  /**
   * Invariant 3: "Emails and pushes name the event, never the content. Assume
   * the inbox may be shared." An auth email cannot reach Table entries, but it
   * CAN reach the signer-up's own user_metadata through `{{ .Data }}` -- which
   * is where a display name, and later anything a session decides to stash,
   * lives. The template must not open that door at all.
   */
  it("interpolates no user metadata", () => {
    expect(html).not.toMatch(/\{\{\s*\.Data\b/);
  });

  it("names no Family, and no Family-scoped noun", () => {
    for (const word of ["family", "tower", "brick", "vow", "ledger", "keepsake", "community"]) {
      expect(html.toLowerCase(), `"${word}" must not appear in an outbound auth email`).not.toContain(word);
    }
  });

  /**
   * Every link resolves through {{ .SiteURL }}. A hardcoded host would mean
   * staging's confirmation emails sending people to production -- the same
   * class of mistake as the hardcoded Sentry DSN in invariant 12.
   */
  it("links only through {{ .SiteURL }}, never a hardcoded host", () => {
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toMatch(/^\{\{\s*\.SiteURL\s*\}\}\//);
    }
    expect(html).not.toMatch(/https?:\/\/(?!\{\{)/);
  });
});

/* -------------------------------------------------------------------------- */
/* The route's two decisions                                                  */
/* -------------------------------------------------------------------------- */

describe("confirmableType", () => {
  it.each(CONFIRMABLE_TYPES)("accepts %s, which a template in this repo produces", (type) => {
    expect(confirmableType(type)).toBe(type);
  });

  /**
   * EmailOtpType widens to `string & {}`, so a cast would let any string
   * through to verifyOtp. These are the types S1's later PRs introduce -- each
   * is added to the closed set in the PR that ships its template, not before.
   */
  it.each(["magiclink", "recovery", "email_change", "invite", "phone_change", "", "sms"])(
    "rejects %s until a template in this repo produces it",
    (type) => {
      expect(confirmableType(type)).toBeNull();
    },
  );

  it("rejects a missing type", () => {
    expect(confirmableType(null)).toBeNull();
    expect(confirmableType(undefined)).toBeNull();
  });
});

describe("safeNext", () => {
  it.each(["/", "/o/caregiver-circle", "/settings/blocked?tab=1"])("passes the same-origin path %s", (p) => {
    expect(safeNext(p)).toBe(p);
  });

  it.each([null, undefined, ""])("falls back when there is no destination (%s)", (p) => {
    expect(safeNext(p)).toBe("/");
  });

  /**
   * A confirmation link is a high-trust link arriving from an inbox. An open
   * redirect here is a phishing primitive with the platform's own domain in
   * front of it.
   */
  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "http://evil.example",
    "javascript:alert(1)",
    "evil.example",
    "\\\\evil.example",
  ])("refuses the off-origin destination %s", (p) => {
    expect(safeNext(p)).toBe("/");
  });

  it("refuses a destination carrying a CR or LF", () => {
    expect(safeNext("/ok\r\nSet-Cookie: session=stolen")).toBe("/");
    expect(safeNext("/ok\nLocation: https://evil.example")).toBe("/");
  });

  it("honours an explicit fallback", () => {
    expect(safeNext("//evil.example", "/login")).toBe("/login");
  });
});
