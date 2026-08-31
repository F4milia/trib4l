import { revokeSession, signOutEverywhere } from "@/app/actions/sessions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Button, Card, ErrorText, PageHeader, Stamp, StatusText } from "@/components/ui";
import { copy } from "@/lib/copy";
import { requireUser } from "@/lib/session";

const t = copy.sessions;

/**
 * Active sessions, and the two ways to end them (S2).
 *
 * Design system sections applied, counted rather than claimed (the 2026-08-27
 * lesson about a migration that "converted 34 surfaces and left the design
 * language unapplied"):
 *
 *   §4.3 ramp B  -- single column, no grid. §4.6 is explicit that a list surface
 *                   with no detail panel takes no two-column split, and that
 *                   inventing an aside to fill a ratio is the layout equivalent
 *                   of invented placeholder copy. There is no second subject
 *                   here.
 *   §4.6 list row -- grid-cols-[4.5rem_1fr_auto] per session: status block,
 *                   content, action.
 *   §4.7         -- border-b-4 page header (via PageHeader), border-b-2 section
 *                   header, hairline dividers inside the list.
 *   §7.4 Stamp   -- "This device" and "2FA verified".
 *   Ledger voice -- every piece of session metadata is mono. This is exactly the
 *                   register the design system reserves it for: machine facts,
 *                   read as a record rather than as prose.
 *
 * No skeleton shimmer and no "Loading…" here: this is a server component that
 * renders with its data or not at all.
 */
export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; revoked?: string }>;
}) {
  const { error, revoked } = await searchParams;
  const { supabase } = await requireUser();

  const { data: sessions } = await supabase.rpc("my_sessions");
  const rows = sessions ?? [];

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <PageHeader eyebrow={t.eyebrow} title={t.title} />

      <p className="max-w-xl text-base text-deep-slate/70">{t.lead}</p>

      <div className="mt-8 space-y-4">
        {error ? <ErrorText>{error}</ErrorText> : null}
        {revoked === "1" ? <StatusText>{t.revokedOne}</StatusText> : null}
        {revoked === "already" ? <StatusText>{t.revokedAlready}</StatusText> : null}
      </div>

      <section className="mt-10">
        <Card>
          {rows.length === 0 ? (
            /* An honest empty state. It cannot normally happen -- reading this
               page requires a session, so at least one row exists -- so it says
               what is true rather than inventing a reason. */
            <p className="text-deep-slate/70">{t.empty}</p>
          ) : (
            <ul className="divide-y divide-deep-slate/15">
              {rows.map((session) => (
                <li
                  key={session.id}
                  className="grid grid-cols-[1fr_auto] items-start gap-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-[4.5rem_1fr_auto]"
                >
                  <p className="hidden font-mono text-xs font-black uppercase tracking-widest text-hearth-ochre sm:block">
                    {session.is_current ? "NOW" : t.labels.lastActive}
                  </p>

                  <div className="min-w-0 space-y-2">
                    <p className="truncate text-sm">
                      {session.user_agent ?? t.labels.unknownDevice}
                    </p>
                    {/* Mono, per the Ledger's visual language. */}
                    <p className="font-mono text-xs text-deep-slate/70">
                      {session.ip ? String(session.ip) : t.labels.unknownIp}
                      {" · "}
                      {t.labels.lastActive}{" "}
                      {session.last_active_at
                        ? new Date(session.last_active_at).toISOString().slice(0, 16).replace("T", " ")
                        : "—"}
                      {" UTC"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {session.is_current ? <Stamp>{t.thisDevice}</Stamp> : null}
                      {session.aal === "aal2" ? <Stamp>{t.labels.twoFactor}</Stamp> : null}
                    </div>
                  </div>

                  {/* No confirmation on a single session: it is reversible by
                      signing in again on that device, and CLAUDE.md's confirm
                      rule is for destructive actions. Ending one session
                      destroys nothing. Sign-out-everywhere below does confirm,
                      because it also ends the session doing the asking. */}
                  <form action={revokeSession}>
                    <input type="hidden" name="session_id" value={session.id} />
                    <Button type="submit" variant="danger">
                      {t.signOutOne}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="mt-10 border-t-2 border-deep-slate pt-5">
        <ConfirmSubmit
          action={signOutEverywhere}
          trigger={t.signOutAll.trigger}
          title={t.signOutAll.title}
          consequences={t.signOutAll.consequences}
          confirmLabel={t.signOutAll.confirm}
        />
      </section>
    </main>
  );
}
