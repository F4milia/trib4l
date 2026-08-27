import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The shell is an async server component, which vitest cannot render, so this
 * asserts the §4.5 contract against the source. The behavioural half -- role
 * gating and active state -- is covered by tests/org-nav.test.ts and
 * tests/org-nav-ui.test.tsx.
 */
const shell = readFileSync(join(process.cwd(), "app/o/[slug]/layout.tsx"), "utf8");
const root = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

describe("app shell (§4.5)", () => {
  it.each([
    ["w-72", "sidebar is 18rem"],
    ["fixed inset-y-0 left-0 z-20", "sidebar is fixed at z-20"],
    ["hidden w-72 flex-col", "sidebar is hidden below lg"],
    ["lg:pl-72", "content is offset by the sidebar width"],
    ["h-24", "brand block height"],
    ["h-20", "mobile header height"],
    ["border-b border-deep-slate/15", "internal dividers are hairlines"],
  ])("%s -- %s", (token) => {
    expect(shell).toContain(token);
  });

  it("opens mobile navigation from a native disclosure, so the shell stays a server component", () => {
    expect(shell).toContain("<details");
    expect(shell).toContain("<summary");
    expect(shell).not.toContain('"use client"');
  });

  it("still resolves role server-side and only formats it through orgNav", () => {
    expect(shell).toMatch(/orgNav\(slug,\s*currentOrg\.role\)/);
  });

  it("keeps the membership guard that makes a non-member indistinguishable from a missing org", () => {
    expect(shell).toContain("notFound()");
    expect(shell).toContain('redirect("/")');
  });

  it("adds no page padding of its own, so it cannot double-pad a surface", () => {
    const wrapper = shell.slice(shell.indexOf('className="min-h-screen'), shell.indexOf('className="min-h-screen') + 60);
    expect(wrapper).not.toMatch(/\bp[xy]?-\d/);
  });
});

describe("the superseded shell is gone", () => {
  it.each(["bg-primary-dark", "text-white/80", "max-w-4xl"])("no longer uses %s", (cls) => {
    expect(shell).not.toContain(cls);
  });

  it("paints the root body from brand tokens, not legacy aliases", () => {
    expect(root).toContain("bg-parchment text-deep-slate");
    expect(root).not.toContain("bg-canvas");
  });
});
