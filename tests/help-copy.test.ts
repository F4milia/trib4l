import { describe, expect, it } from "vitest";
import { copy } from "../lib/copy";

/**
 * The help page tells people how the product works, so its copy is a set of
 * factual claims -- the one place in the UI where invented text does active
 * harm rather than just looking unfinished. CLAUDE.md: "honest empty states,
 * no invented placeholders."
 *
 * The guard that matters is the second one below. This repo's schema has no
 * Towers, Bricks, Vows, Table entries, Ledger or Keepsake -- the V1 audit says
 * so, and `\dt` agrees. An FAQ that explains any of them would be describing
 * software that does not exist to a person who came here because they were
 * already confused.
 */

/** Domain nouns the run doc describes and this repo has no schema for yet. */
const NOT_BUILT_YET = [
  "tower",
  "brick",
  "vow",
  "the table",
  "table entry",
  "table prompt",
  "ledger",
  "keepsake",
  "family night",
  "slice",
  "streak",
];

const help = copy.help;
const answers = help.faq.map((entry) => entry.a);
const questions = help.faq.map((entry) => entry.q);

describe("help copy", () => {
  it("has questions and answers, and none of them are empty", () => {
    expect(help.faq.length).toBeGreaterThanOrEqual(4);
    for (const entry of help.faq) {
      expect(entry.q.trim().length).toBeGreaterThan(0);
      expect(entry.a.trim().length).toBeGreaterThan(0);
    }
  });

  it("describes nothing this repo has not built", () => {
    const prose = [...questions, ...answers, help.intro, help.formIntro].join(" ").toLowerCase();
    const invented = NOT_BUILT_YET.filter((noun) => prose.includes(noun));
    expect(invented).toEqual([]);
  });

  it("carries no placeholder marker", () => {
    // W2 uses "[PENDING LEGAL REVIEW]" deliberately on the legal pages. A help
    // answer has no such excuse: either we know how it works or we say nothing.
    const prose = [...questions, ...answers].join(" ");
    expect(prose).not.toMatch(/\[.*(TODO|TBD|PENDING|PLACEHOLDER).*\]/i);
    expect(prose).not.toMatch(/lorem ipsum/i);
  });

  it("every question is phrased as one, and every answer is a sentence", () => {
    for (const q of questions) expect(q).toMatch(/[?.]$/);
    for (const a of answers) expect(a.trim()).toMatch(/[.]$/);
  });

  it("the error messages say what to do, in plain words", () => {
    // The rule for every session: limits and failures fail with plain
    // messages. No codes, no table names, no policy jargon.
    for (const message of Object.values(help.errors)) {
      expect(message).toMatch(/[.]$/);
      expect(message).not.toMatch(/\b(?:PGRST|42501|23514|row.level|policy|null|constraint)\b/i);
    }
  });

  it("promises a reply channel it can actually keep", () => {
    // The form says replies come by email to the account address. That is the
    // only address the platform has -- profiles deliberately holds no email
    // column, so anything else would be a promise with no data behind it.
    expect(help.formIntro.toLowerCase()).toContain("email");
    expect(help.sent.toLowerCase()).toContain("email");
  });
});
