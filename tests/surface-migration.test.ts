import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Whole-tree drift guard. Phase C carried a hand-maintained file list; now
 * that PR D1 has removed the legacy aliases from the token layer entirely,
 * this walks app/ and components/ instead -- so a NEW surface is covered the
 * moment it is created, without anyone remembering to add it.
 *
 * Every rule here is a line from f4milia-design-system.md that CSS alone
 * cannot enforce, because the offending class would still render.
 */
const ROOTS = ["app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(relative(process.cwd(), full));
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(join(process.cwd(), r)));

/** The canvas/ink/teal/amber palette of the superseded docs/design-system.md. */
const LEGACY_ALIAS =
  /\b(?:bg|text|border|divide|ring|from|to|placeholder|outline|caret|decoration)-(?:canvas|canvas-raised|ink|ink-soft|primary-dark|primary-soft|accent-soft|line|danger)\b/;

describe("surfaces exist to guard", () => {
  it("found the tsx tree", () => {
    expect(files.length).toBeGreaterThan(30);
  });
});

describe.each(files)("%s", (file) => {
  const src = readFileSync(join(process.cwd(), file), "utf8");

  it("uses no superseded palette alias", () => {
    expect(src).not.toMatch(LEGACY_ALIAS);
  });

  it("carries no rounded-* class (§5.1 — zero radius, absolutely)", () => {
    expect(src).not.toMatch(/\brounded-/);
  });

  it("carries no blurred or spread shadow (§5.3 — no blur, no spread, ever)", () => {
    expect(src).not.toMatch(/\bshadow-(?:sm|md|lg|xl|2xl|inner)\b/);
  });

  it("uses the design system's type voices, not the legacy font aliases", () => {
    expect(src).not.toMatch(/\bfont-(?:display|body)\b/);
  });

  it("routes form controls through the primitives, not raw markup", () => {
    // components/ui.tsx is where the primitives are defined.
    if (file === "components/ui.tsx") return;
    expect(src).not.toMatch(/<textarea\b/);
    expect(src).not.toMatch(/<select\b/);
  });

  it("uses no white or off-white fill outside the palette", () => {
    expect(src).not.toMatch(/\b(?:bg|text)-white\b/);
  });
});
