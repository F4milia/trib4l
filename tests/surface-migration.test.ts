import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Drift guard for the surfaces Phase C has migrated. Each PR appends its
 * files here, so a later edit cannot quietly reintroduce a superseded alias,
 * a radius, or a blurred shadow on a surface already converted. D1 removes
 * the aliases from the token layer entirely and turns this into a
 * whole-tree assertion.
 */
export const MIGRATED = [
  // C2 — auth + admin
  "app/login/page.tsx",
  "app/signup/page.tsx",
  "app/admin/organizations/new/page.tsx",
  // C3 — org dashboard, members, search
  "app/o/[slug]/page.tsx",
  "app/o/[slug]/members/page.tsx",
  "app/o/[slug]/search/page.tsx",
  "app/o/[slug]/members/report/page.tsx",
];

const LEGACY =
  /\b(?:bg|text|border|divide|ring|from|to|placeholder|outline)-(?:canvas|canvas-raised|ink|ink-soft|primary|primary-dark|primary-soft|accent|accent-soft|line|danger)\b/;

describe.each(MIGRATED)("%s", (file) => {
  const src = readFileSync(join(process.cwd(), file), "utf8");

  it("uses no superseded palette alias", () => {
    expect(src).not.toMatch(LEGACY);
  });

  it("carries no rounded-* class -- §5.1 is absolute, not just reset in CSS", () => {
    expect(src).not.toMatch(/\brounded-/);
  });

  it("carries no blurred or spread shadow", () => {
    expect(src).not.toMatch(/\bshadow-(?:sm|md|lg|xl|2xl|inner)\b/);
  });

  it("uses the design system's type voices, not the legacy font aliases", () => {
    expect(src).not.toMatch(/\bfont-(?:display|body)\b/);
  });

  it("uses PageHeader rather than the bare PageHeading", () => {
    if (src.includes("PageHead")) expect(src).toContain("PageHeader");
  });

  it("routes form controls through the primitives, not raw markup", () => {
    expect(src).not.toMatch(/<textarea\b/);
    expect(src).not.toMatch(/<select\b/);
  });
});
