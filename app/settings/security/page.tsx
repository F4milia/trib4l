import Link from "next/link";
import { unenrollTotp } from "@/app/actions/mfa";
import { TotpEnrollment } from "@/components/auth/totp-enrollment";
import { Button, Card, ErrorText, PageHeader, Stamp, StatusText } from "@/components/ui";
import { CHALLENGE_PATH, assuranceOutcome } from "@/lib/auth/assurance";
import { copy } from "@/lib/copy";
import { requireUser } from "@/lib/session";

const t = copy.mfa;

/**
 * Two-factor sign-in (S2). Optional for members; PR 8 makes it enforced for
 * platform staff, and this is the page they are held on until it is done.
 *
 * Design system: §4.3 ramp B, single column, no grid -- §4.6 rules out an
 * invented aside, and there is no second subject here. §4.7 rhythm, §7.4 Stamp
 * for the verified marker, mono for the machine facts (the setup key, dates).
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; removed?: string }>;
}) {
  const { error, removed } = await searchParams;
  const { supabase } = await requireUser({ skipAssuranceGate: true });

  /**
   * `.totp` rather than `.all`, and measured rather than guessed: `.totp` holds
   * only VERIFIED factors, while `.all` also carries the unverified leftovers of
   * an abandoned setup. Listing `.all` here would show a half-finished setup as
   * though it were protecting the account.
   */
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp ?? [];

  /**
   * Why this person may be here involuntarily. The gate sends staff with no
   * authenticator to this page and nowhere else, and a page that silently
   * refuses to let you leave is worse than one that says so. Asked only when
   * there is no factor -- once there is one, the question is moot and the extra
   * round trip pointless.
   */
  const heldHere = verified.length === 0 && Boolean((await supabase.rpc("is_platform_staff")).data);

  /**
   * Whether this session may change anything here at all.
   *
   * Measured 2026-09-01, and it changed this page: GoTrue refuses BOTH enrol and
   * unenrol from an aal1 session once a verified factor exists. So a person who
   * has an authenticator but has not used it this session was being offered a
   * "Set up an authenticator" button that could only ever answer "Setup could not
   * be started. Try again." -- advice that would never work, however many times
   * they followed it.
   *
   * They are offered the code screen instead. The list below still renders, so
   * the page is honest about what exists; only the actions are withheld, because
   * only the actions are impossible.
   */
  const outcome = await assuranceOutcome(supabase);
  const needsCodeFirst = !outcome.ok && outcome.reason === "code-required";

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <PageHeader eyebrow={t.eyebrow} title={t.title} />

      <p className="max-w-xl text-base text-deep-slate/70">{t.lead}</p>
      <p className="mt-2 font-mono text-xs uppercase tracking-widest text-deep-slate/70">
        {t.optionalNote}
      </p>

      <div className="mt-8 space-y-4">
        {heldHere ? <StatusText>{t.staffRequiredNote}</StatusText> : null}
        {needsCodeFirst ? (
          <div className="space-y-3">
            <StatusText>{t.needsCodeFirst}</StatusText>
            <Link href={CHALLENGE_PATH} className="inline-block text-terracotta underline">
              {t.enterCode}
            </Link>
          </div>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {removed ? <StatusText>{t.removed}</StatusText> : null}
      </div>

      <section className="mt-10">
        <h2 className="border-b-2 border-deep-slate pb-3 font-serif text-3xl leading-[0.9] tracking-tighter">
          {t.activeHeading}
        </h2>

        <Card className="mt-5">
          {verified.length === 0 ? (
            <p className="text-deep-slate/70">{t.none}</p>
          ) : (
            <ul className="divide-y divide-deep-slate/15">
              {verified.map((factor) => (
                <li
                  key={factor.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="space-y-2">
                    <Stamp>{t.eyebrow}</Stamp>
                    <p className="font-mono text-xs text-deep-slate/70">
                      {t.added} {new Date(factor.created_at).toISOString().slice(0, 10)}
                    </p>
                  </div>
                  {/* Withheld rather than shown-and-failing: unenrol needs an
                      aal2 session, so at aal1 this button could only produce an
                      error telling them to do what the notice above already
                      says. */}
                  {needsCodeFirst ? null : (
                    <form action={unenrollTotp}>
                      <input type="hidden" name="factor_id" value={factor.id} />
                      <Button type="submit" variant="danger">
                        {t.remove}
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {needsCodeFirst ? null : (
        <section className="mt-10 border-t-2 border-deep-slate pt-5">
          <TotpEnrollment />
        </section>
      )}
    </main>
  );
}
