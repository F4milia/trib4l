import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the token layer against drift. f4milia-design-system.md is the
 * single source of truth for design from 2026-08-27 (docs/design-system.md
 * is SUPERSEDED) -- these assertions are the mechanical half of that, so a
 * later session can't quietly reintroduce the old palette or a radius.
 *
 * Terracotta is #BC472E, not the doc's #C84B31: the specified value measures
 * 4.25:1 against its own parchment label and fails WCAG AA for normal text.
 * Darkened globally to 4.70:1 per James's decision, resolving CLAUDE.md's
 * seeded learned constraint ("adjust the token to a verified-passing value,
 * never exempt the button"). See docs/preflight-audit.md section 4c.
 */
// jsdom's import.meta.url is not a file: URL, so resolve from the vitest root.
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8").toLowerCase();

describe("brand core tokens", () => {
  it.each([
    ["parchment", "#f7f4f0"],
    ["deep-slate", "#1a1a1a"],
    ["terracotta", "#bc472e"],
    ["baked-clay", "#a04729"],
    ["hearth-ochre", "#e3b46b"],
  ])("defines %s as %s", (name, hex) => {
    expect(css).toContain(`--color-${name}: ${hex}`);
  });

  it("does not ship the failing terracotta value anywhere", () => {
    expect(css).not.toContain("c84b31");
    expect(css).not.toContain("200, 75, 49");
    expect(css).not.toContain("200,75,49");
  });
});

describe("superseded palette is gone", () => {
  // docs/design-system.md's canvas/ink/teal/amber values.
  it.each(["#f5f5f0", "#1e2e2c", "#4a5a57", "#2f5d56", "#1e3f3a", "#e3ebe8", "#c98a3e", "#f3e3c5", "#ddd9cd", "#b3432b"])(
    "no longer contains %s",
    (hex) => {
      expect(css).not.toContain(hex);
    },
  );
});

describe("shape", () => {
  it("zeroes every radius scale step", () => {
    for (const step of ["", "-sm", "-md", "-lg", "-xl", "-2xl", "-3xl"]) {
      expect(css).toMatch(new RegExp(`--radius${step}:\\s*0`));
    }
  });

  it("keeps the universal !important radius reset", () => {
    expect(css).toMatch(/\*\s*{\s*border-radius:\s*0\s*!important/);
  });
});

describe("global heading rule", () => {
  it.each([
    ["text-transform", "uppercase"],
    ["font-weight", "900"],
    ["letter-spacing", "-0.08em"],
    ["line-height", "0.92"],
  ])("stamps %s: %s on h1-h6", (prop, value) => {
    const rule = css.slice(css.indexOf("h1,"), css.indexOf("h1,") + 400);
    expect(rule).toContain(`${prop}: ${value}`);
  });
});

describe("noise plate", () => {
  const plate = css.slice(css.indexOf("body::before"), css.indexOf("body::before") + 900);

  it.each([
    ["position: fixed", "is viewport-fixed"],
    ["pointer-events: none", "never intercepts input"],
    ["mix-blend-mode: multiply", "multiplies onto the ground"],
    ["z-index: 50", "sits above content"],
    ["opacity: 0.16", "ships at the specified opacity"],
  ])("%s -- %s", (decl) => {
    expect(plate).toContain(decl);
  });
});

describe("theming", () => {
  it("declares the dark custom variant", () => {
    expect(css).toContain("@custom-variant dark");
  });

  it.each(["--background", "--foreground", "--primary", "--primary-foreground", "--card", "--muted", "--muted-foreground", "--border", "--input", "--ring", "--secondary", "--secondary-foreground", "--destructive"])(
    "defines %s in both light and dark",
    (token) => {
      const light = css.slice(css.indexOf(":root"), css.indexOf(".dark {"));
      const dark = css.slice(css.indexOf(".dark {"));
      expect(light).toContain(`${token}:`);
      expect(dark).toContain(`${token}:`);
    },
  );

  it("flips primary to hearth-ochre on ink -- terracotta lacks contrast there", () => {
    const dark = css.slice(css.indexOf(".dark {"));
    expect(dark).toMatch(/--primary:\s*#e3b46b/);
  });

  it("declares color-scheme for both themes", () => {
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("color-scheme: dark");
  });
});
