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

/**
 * §3.1 runs the system on three type voices, and the doc calls the
 * serif/mono contrast load-bearing: "the design depends on it". The source
 * repo shipped no webfonts, so these are bound here for the first time.
 *
 * next/font self-hosts at build time -- no runtime request to Google, which
 * also keeps the font layer clear of invariant 4's concerns.
 */
describe("type voices (3.1)", () => {
  const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

  it("binds the voices through next/font rather than a stylesheet link", () => {
    expect(layout).toContain('from "next/font/google"');
    expect(layout).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it.each(["Playfair_Display", "Inter", "JetBrains_Mono"])("loads %s", (family) => {
    expect(layout).toContain(family);
  });

  /**
   * The real failure mode for a two-file font binding: someone renames a
   * variable on one side and the other silently falls through to its
   * fallback stack, which still renders -- so nothing breaks loudly and the
   * serif/mono contrast the design depends on is quietly gone.
   */
  it("has every next/font variable consumed by the token layer", () => {
    const declared = [...layout.matchAll(/variable:\s*"(--font-[a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(declared).toHaveLength(3);
    for (const variable of declared) {
      expect(css).toContain(`var(${variable})`);
    }
  });

  it("has every next/font variable applied to the document element", () => {
    const consts = [...layout.matchAll(/const (\w+) = (?:Playfair_Display|Inter|JetBrains_Mono)\(/g)].map((m) => m[1]);
    expect(consts).toHaveLength(3);
    const html = layout.slice(layout.indexOf("<html"), layout.indexOf(">", layout.indexOf("<html")));
    for (const name of consts) {
      expect(html).toContain(`${name}.variable`);
    }
  });

  it.each([
    ["--font-serif", "serif"],
    ["--font-sans", "sans-serif"],
    ["--font-mono", "monospace"],
  ])("keeps a real fallback stack behind %s", (token, generic) => {
    expect(css).toMatch(new RegExp(`${token}:\\s*var\\(--font-[a-z0-9-]+\\),[^;]*${generic}`));
  });

  it("declares theme-color for both themes (9)", () => {
    expect(layout).toContain("themeColor");
    expect(layout).toMatch(/prefers-color-scheme:\s*light/);
    expect(layout).toMatch(/prefers-color-scheme:\s*dark/);
  });
});
