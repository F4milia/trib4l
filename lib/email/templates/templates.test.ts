import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_TOKENS } from "../layout";
import {
  renderFamilyInvite,
  renderFamilyNightDigest,
  renderPasswordReset,
  renderVowNotification,
  type RenderedEmail,
} from "./index";

const URL = "https://f4milia.test/x/token-abc";

const ALL: { name: string; rendered: RenderedEmail }[] = [
  { name: "family invite", rendered: renderFamilyInvite({ acceptUrl: URL }) },
  { name: "family night digest", rendered: renderFamilyNightDigest({ digestUrl: URL }) },
  { name: "vow assigned", rendered: renderVowNotification({ vowUrl: URL, event: "assigned" }) },
  { name: "vow due soon", rendered: renderVowNotification({ vowUrl: URL, event: "due_soon" }) },
  { name: "vow completed", rendered: renderVowNotification({ vowUrl: URL, event: "completed" }) },
  { name: "password reset", rendered: renderPasswordReset({ resetUrl: URL }) },
];

describe("every template renders", () => {
  it.each(ALL)("$name produces a subject, an HTML part and a text part", ({ rendered }) => {
    expect(rendered.subject.length).toBeGreaterThan(0);
    expect(rendered.html).toContain("<!doctype html>");
    expect(rendered.text.length).toBeGreaterThan(0);
    expect(rendered.kind).toMatch(/^[a-z_]+$/);
  });

  it.each(ALL)("$name links to the URL it was given, in both parts", ({ rendered }) => {
    expect(rendered.html).toContain(URL);
    expect(rendered.text).toContain(URL);
  });

  it("the three Vow events are three different messages, not one with a variable", () => {
    const subjects = ALL.filter((t) => t.name.startsWith("vow")).map((t) => t.rendered.subject);
    expect(new Set(subjects).size).toBe(3);
  });
});

describe("Hearth & Material tokens (f4milia-design-system.md)", () => {
  it.each(ALL)("$name uses the Parchment ground and Deep Slate ink", ({ rendered }) => {
    expect(rendered.html).toContain(EMAIL_TOKENS.parchment);
    expect(rendered.html).toContain(EMAIL_TOKENS.deepSlate);
  });

  it.each(ALL)("$name reserves Terracotta for the single primary action", ({ rendered }) => {
    // "Terracotta for primary actions ONLY". One occurrence: the action cell's
    // background. More than one means it has started being used as decoration.
    const occurrences = rendered.html.split(EMAIL_TOKENS.terracotta).length - 1;
    expect(occurrences).toBe(1);
  });

  it.each(ALL)("$name has zero border-radius anywhere", ({ rendered }) => {
    // "Zero border-radius, everywhere, no exceptions." In an email that means
    // the property is never written at all -- there is no stylesheet to
    // override it from.
    expect(rendered.html).not.toMatch(/border-radius/i);
  });
});

// The invariant-3 test. It asserts a property of the SOURCE, not of one
// rendered output, because output assertions can only catch the content a test
// happened to think of.
describe("no outbound message can carry Family content -- invariant 3", () => {
  const source = readFileSync(path.join(import.meta.dirname, "index.ts"), "utf8");

  it("no exported render function accepts a free-text parameter", () => {
    // Reads the argument object of every `export function render*(args: {...})`
    // and inspects its fields. A `string` field is allowed only when its name
    // ends in Url -- a link is not content. Anything else typed `string` is a
    // hole a caller could pour a Table entry into.
    const signatures = [...source.matchAll(/export function (render\w+)\(args:\s*\{([^}]*)\}\)/g)];

    const freeText: string[] = [];
    for (const [, fn, argBlock] of signatures) {
      for (const [, name, type] of argBlock.matchAll(/(\w+):\s*(\w+)/g)) {
        if (type === "string" && !/Url$/.test(name)) freeText.push(`${fn}.${name}`);
      }
    }

    expect(freeText).toEqual([]);
    // Every exported template must have been seen. Without this the regex
    // could silently match nothing after a refactor and the test would pass
    // while asserting about an empty set.
    expect(signatures.map(([, fn]) => fn).sort()).toEqual([
      "renderFamilyInvite",
      "renderFamilyNightDigest",
      "renderPasswordReset",
      "renderVowNotification",
    ]);
  });

  it("no template interpolates anything but its own copy-deck entry and its URL", () => {
    // Template literals and string concatenation in this file would be the
    // other way content could arrive. Everything prose-shaped comes from
    // `copy.email.*`; the only dynamic values reaching the layout are the URL
    // arguments.
    expect(source).not.toMatch(/`[^`]*\$\{/);
  });

  it.each(ALL)("$name's rendered output contains no interpolation marker", ({ rendered }) => {
    // A copy-deck string that accidentally shipped a placeholder would show up
    // here rather than in a member's inbox.
    expect(rendered.html).not.toMatch(/\{\{|\$\{|%s\b/);
    expect(rendered.text).not.toMatch(/\{\{|\$\{|%s\b/);
  });

  it("a caller cannot smuggle markup through a URL", () => {
    const rendered = renderFamilyInvite({
      acceptUrl: 'https://f4milia.test/i/x"><script>alert(1)</script>',
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });
});
