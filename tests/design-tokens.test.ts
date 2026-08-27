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

describe("legacy aliases are gone (D1)", () => {
  it.each([
    "--color-canvas", "--color-canvas-raised", "--color-ink", "--color-ink-soft",
    "--color-primary-dark", "--color-primary-soft", "--color-accent", "--color-accent-soft",
    "--color-line", "--color-danger", "--font-display", "--font-body",
  ])("no longer defines %s", (token) => {
    expect(css).not.toMatch(new RegExp(`${token}\\s*:`));
  });
});

describe("shape", () => {
  it("zeroes every radius scale step, exactly -- not 0.25rem", () => {
    for (const step of ["", "-sm", "-md", "-lg", "-xl", "-2xl", "-3xl"]) {
      expect(css).toMatch(new RegExp(`--radius${step}\\s*:\\s*0\\s*;`));
    }
  });

  it("keeps the universal !important radius reset", () => {
    expect(css).toMatch(/\*\s*{\s*border-radius:\s*0\s*!important/);
  });
});

describe("global heading rule", () => {
  it("applies to every heading level, not just h1", () => {
    const selector = css.slice(css.indexOf("h1,"), css.indexOf("{", css.indexOf("h1,")));
    for (const level of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
      expect(selector).toContain(level);
    }
  });

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
      const declared = new RegExp(`${token}\\s*:`);
      expect(light).toMatch(declared);
      expect(dark).toMatch(declared);
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

/**
 * §6 calls these "the system's own primitives" and says to port them as-is:
 * "These five classes carry the visual identity." Six here -- the doc flags
 * .panel-paper as referenced in its source repo but never defined, and gives
 * the definition to add.
 */
describe("house utilities (6)", () => {
  const block = (name: string) => {
    const start = css.indexOf(`.${name}`);
    expect(start, `.${name} is not defined`).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start) + 1);
  };

  it.each(["panel-ink", "panel-dark", "panel-paper", "neon-repair", "stamp", "masonry"])(
    "defines .%s",
    (name) => {
      expect(block(name).length).toBeGreaterThan(0);
    },
  );

  it("draws .panel-ink from currentColor so it inverts with its container", () => {
    expect(block("panel-ink")).toContain("currentcolor");
  });

  it("gives .panel-dark a parchment border and a terracotta shadow -- terracotta shadows go on ink", () => {
    const b = block("panel-dark");
    expect(b).toMatch(/border:\s*2px solid var\(--color-parchment\)/);
    expect(b).toMatch(/box-shadow:[^;]*var\(--color-terracotta\)/);
  });

  it.each(["panel-ink", "panel-dark", "panel-paper"])("keeps .%s elevation hard -- no blur, no spread", (name) => {
    const shadow = block(name).match(/box-shadow:\s*([^;]+)/)?.[1];
    if (!shadow) return; // panel-paper is the un-elevated counterpart
    expect(shadow).toMatch(/^\d+px \d+px 0 /);
  });

  it("reserves the only glow in the system for .neon-repair", () => {
    expect(block("neon-repair")).toContain("inset");
    // Nothing else may carry a blurred shadow.
    const blurred = [...css.matchAll(/box-shadow:\s*([^;]+);/g)]
      .map((m) => m[1])
      .filter((s) => !s.includes("inset") && !/^\d+px \d+px 0 /.test(s.trim()));
    expect(blurred).toEqual([]);
  });

  it("borders .stamp from currentColor and sets it uppercase 900", () => {
    const b = block("stamp");
    expect(b).toContain("currentcolor");
    expect(b).toContain("text-transform: uppercase");
    expect(b).toContain("font-weight: 900");
  });

  it("lays .masonry out as 8 bricks, 6 on small screens", () => {
    expect(block("masonry")).toMatch(/grid-template-columns:\s*repeat\(8,\s*1fr\)/);
    const mobile = css.slice(css.indexOf("max-width: 640px"));
    expect(mobile).toMatch(/grid-template-columns:\s*repeat\(6,\s*1fr\)/);
  });

  it("rotates the masonry brick fills across three brand colors", () => {
    const masonry = css.slice(css.indexOf(".masonry"));
    for (const token of ["--color-terracotta", "--color-hearth-ochre", "--color-baked-clay"]) {
      expect(masonry).toContain(token);
    }
  });
});
