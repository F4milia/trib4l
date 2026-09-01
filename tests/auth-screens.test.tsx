import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthShell } from "@/components/auth-shell";
import { copy } from "@/lib/copy";

/**
 * S1's design half. These are the first screens anyone sees, so the Hearth &
 * Material contract is asserted here at the class level -- the same reasoning
 * as tests/ui-primitives.test.tsx: a design system's contract IS its classes,
 * and a class-level assertion is what stops a later session quietly
 * reintroducing a fill, a blur, or a Supabase-default form.
 *
 * tests/surface-migration.test.ts already walks the whole tsx tree for the
 * negative rules (no radius, no blurred shadow, no bg-white, no raw select).
 * Nothing here duplicates those; these are the positive obligations §3.7,
 * §4.7 and §7.3 place on an auth screen specifically.
 */

function shell(props: Partial<Parameters<typeof AuthShell>[0]> = {}) {
  return render(
    <AuthShell eyebrow="Sign in" title="Welcome back." {...props}>
      <form>
        <button type="submit">Log in</button>
      </form>
    </AuthShell>,
  );
}

describe("AuthShell — page eyebrow (§3.7)", () => {
  it("renders the eyebrow in the mono micro voice at 0.2em", () => {
    shell();
    const eyebrow = screen.getByText("Sign in");
    expect(eyebrow).toHaveClass("font-mono", "uppercase", "font-black", "tracking-[0.2em]");
  });

  /**
   * §9: deep-slate/45–/60 all fail AA. baked-clay is the eyebrow colour §3.7
   * specifies and measures 5.78:1 on parchment.
   */
  it("colours the eyebrow with baked-clay, never a failing ink alpha", () => {
    shell();
    expect(screen.getByText("Sign in")).toHaveClass("text-baked-clay");
    expect(screen.getByText("Sign in").className).not.toMatch(/text-deep-slate\/(?:45|50|55|60)\b/);
  });
});

describe("AuthShell — display type (§3.2, §3.4)", () => {
  it("puts the title in the display voice with sub-1.0 leading and tight tracking", () => {
    shell();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveClass("font-serif", "tracking-tighter");
    expect(h1.className).toMatch(/leading-\[0\.(?:8[0-9]|9[0-5])\]/);
  });

  /**
   * The one deliberate divergence from PageHeader, which pairs text-5xl with
   * sm:text-7xl. An auth column is max-w-md; at 4.5rem a single word such as
   * "account." is wider than the column and breaks mid-word. The display tier
   * stays at its 3rem base step here at every width.
   */
  it("does not bump to the wider display steps inside a max-w-md column", () => {
    shell();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveClass("text-5xl");
    expect(h1.className).not.toMatch(/sm:text-(?:6|7|8|9)xl/);
  });

  it("closes the header with §4.7's 4px rule, not a hairline", () => {
    shell();
    const header = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(header).toHaveClass("border-b-4", "border-deep-slate");
  });
});

describe("AuthShell — container (§7.3)", () => {
  it("seats the form in the ink panel, the default container treatment", () => {
    shell();
    const panel = screen.getByRole("button", { name: "Log in" }).closest(".panel-ink");
    expect(panel).not.toBeNull();
    expect(panel).toHaveClass("bg-parchment");
  });

  /**
   * Acceptance: "auth screens match the design tokens on mobile widths." The
   * measurable part is that the column is mobile-first -- a fixed width, or a
   * padding step that only exists at sm:, would strand the panel's 5px offset
   * shadow against the viewport edge on a 320px screen.
   */
  it("is mobile-first: a fluid max-width and padding that exists at the base step", () => {
    shell();
    const main = screen.getByRole("main");
    expect(main).toHaveClass("max-w-md", "px-5");
    expect(main.className).not.toMatch(/\bw-\[\d/);
  });
});

describe("AuthShell — error surface", () => {
  it("renders an error through the alert primitive so it is announced", () => {
    shell({ error: "Invalid credentials." });
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials.");
  });

  it("renders no alert region at all when there is no error", () => {
    shell();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("AuthShell — wordmark", () => {
  it("draws the wordmark from the copy deck and links it home", () => {
    shell();
    const mark = screen.getByRole("link", { name: copy.brand.wordmark });
    expect(mark).toHaveAttribute("href", "/");
  });
});

/**
 * CLAUDE.md: "New UI strings go in the copy deck, never inline." Asserted
 * against the page sources rather than the render, because a string that is
 * inline still renders identically -- the render cannot tell you where it
 * came from.
 */
describe("copy deck", () => {
  const PAGES = [
    "app/login/page.tsx",
    "app/signup/page.tsx",
    "app/check-email/page.tsx",
    "app/magic-link/page.tsx",
    "app/link-sent/page.tsx",
    "app/forgot-password/page.tsx",
    "app/reset-sent/page.tsx",
    "app/reset-password/page.tsx",
    "app/account/email/page.tsx",
    // The three forms moved out of their pages when field-level errors
    // landed. Without these the guard would still pass on the pages -- which
    // now contain no strings at all -- while quietly covering nothing.
    "components/auth/login-form.tsx",
    "components/auth/signup-form.tsx",
    "components/auth/reset-password-form.tsx",
  ] as const;

  function strings(node: unknown, out: string[] = []): string[] {
    if (typeof node === "string") out.push(node);
    else if (node && typeof node === "object") Object.values(node).forEach((v) => strings(v, out));
    return out;
  }

  it.each(PAGES)("%s imports the copy deck", (page) => {
    const src = readFileSync(join(process.cwd(), page), "utf8");
    expect(src).toMatch(/from "@\/lib\/copy"/);
  });

  /**
   * Scanned over authored text only -- quoted literals and JSX text nodes --
   * not raw source, for the same reason tests/surface-migration.test.ts scans
   * string literals only: `copy.auth.checkEmail` contains "Email", and a
   * whole-source scan flagged the identifier that reads the deck as if it were
   * a string that had bypassed it. A guard that fires on the correct pattern
   * teaches people to work around it.
   */
  function authoredText(src: string): string[] {
    const quoted = (src.match(/(["'])(?:\\.|(?!\1)[^\\])*\1/g) ?? []).map((s) => s.slice(1, -1));
    const jsxText = [...src.matchAll(/>([^<>{}]*)</g)].map((m) => m[1]);
    return [...quoted, ...jsxText].map((s) => s.trim());
  }

  /**
   * Short values are matched whole, longer ones by substring.
   *
   * Substring alone is wrong below a certain length: the OAuth divider label
   * "or" is a substring of `border-t`, and it flagged the className on four
   * pages that had done nothing wrong. Whole-value alone is weaker for real
   * prose, which is often authored inside a larger JSX run. Splitting at 12
   * characters keeps sensitivity where it is safe and drops the false
   * positives that would otherwise teach people to route around the guard.
   */
  const WHOLE_MATCH_BELOW = 12;

  it.each(PAGES)("%s hardcodes none of the auth strings inline", (page) => {
    const authored = authoredText(readFileSync(join(process.cwd(), page), "utf8"));
    for (const s of strings(copy.auth)) {
      const inline =
        s.length < WHOLE_MATCH_BELOW
          ? authored.includes(s)
          : authored.some((value) => value.includes(s));
      expect(inline, `"${s}" is inline in ${page}; it belongs in lib/copy.ts`).toBe(false);
    }
  });

  it("keeps the consent notice honest -- it describes real staff access, and invents no legal terms", () => {
    // CLAUDE.md invariant 11: placeholder legal text is visibly
    // "[PENDING LEGAL REVIEW]", never plausible-sounding invented terms. This
    // notice is not legal language -- it states an actual platform behaviour
    // (docs/trib4l-docs/data-retention-policy.md) -- so it must not read as terms either.
    const body = copy.auth.signup.consent.body;
    expect(body).not.toMatch(/\b(?:hereby|warrant|indemnif|liabilit|governing law|arbitration)\b/i);
  });
});
