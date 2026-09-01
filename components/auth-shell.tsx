import Link from "next/link";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { Card, ErrorText, Eyebrow } from "@/components/ui";

/**
 * The frame every auth screen renders into. S1's prompt: "these are the first
 * screens anyone sees; they set the tone" -- so they get the full §4.7 header
 * treatment (eyebrow, display title, 4px closing rule) over a §7.3 ink panel,
 * not a Supabase-default form on a bare page.
 *
 * One deliberate divergence from PageHeader, which pairs `text-5xl` with
 * `sm:text-7xl`: this column is max-w-md, and at 4.5rem a single word like
 * "account." is wider than the column and breaks mid-word. The display tier
 * stays on its 3rem base step at every width here. Everything else --
 * uppercase, weight 900, -0.08em tracking -- arrives from globals.css's
 * global h1-h6 rule (§3.2), which is why it is not restated on the element.
 *
 * Mobile-first by construction: `px-5` exists at the base step, not only at
 * `sm:`, so the panel's 5px offset shadow still has ground under it on a
 * 320px viewport.
 */
export function AuthShell({
  eyebrow,
  title,
  error,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  error?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-5 py-12 sm:px-8">
      <Link
        href="/"
        className="w-fit font-serif text-2xl font-black uppercase tracking-tighter text-deep-slate transition-colors hover:text-terracotta"
      >
        {copy.brand.wordmark}
      </Link>

      <header className="border-b-4 border-deep-slate pb-5">
        <Eyebrow className="mb-3">{eyebrow}</Eyebrow>
        <h1 className="font-serif text-5xl leading-[0.86] tracking-tighter">{title}</h1>
      </header>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>{children}</Card>

      {/**
       * A div, not a <p>. The /auth/verify screen (S2) puts a sign-out FORM in
       * this slot, and a <form> inside a <p> is invalid HTML: the browser closes
       * the paragraph early, so the parsed DOM differs from the server render and
       * React logs a hydration mismatch. Caught in the browser console by the
       * e2e suite, not by any assertion.
       *
       * Fixed here rather than in the caller because the slot is the problem: it
       * accepted only phrasing content while looking like it accepted anything,
       * so the next person putting a button in a footer would meet the same bug.
       * Preflight zeroes paragraph margins, so nothing moves.
       *
       * NOTE, no apostrophes above, deliberately: surface-migration.test.ts
       * extracts "string literals" by pairing quote characters across the whole
       * file, and an apostrophe in a comment flips that pairing -- which made the
       * word shadow on line 20 read as being inside a class string and failed the
       * no-shadow rule on a file this change did not otherwise touch.
       */}
      {footer ? <div className="text-sm text-deep-slate/70">{footer}</div> : null}
    </main>
  );
}
