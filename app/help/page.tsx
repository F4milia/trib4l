import { requireUser, getUserOrgs } from "@/lib/session";
import { submitSupportRequest } from "@/app/actions/support";
import { copy } from "@/lib/copy";
import {
  Button,
  Card,
  ErrorText,
  Input,
  Label,
  PageHeader,
  Select,
  StatusPip,
  Textarea,
} from "@/components/ui";

/**
 * H1's help page. A top-level route, not under /o/[slug], and that is the
 * point: H1's named edge case is "a user in no Family submits the form."
 * Someone who has signed up and not yet joined a Family has no org slug to
 * put in a URL, and they are the person most likely to need this page.
 *
 * Signed-in only. The insert policy is authenticated-only, because an
 * anonymous contact form on an invite-only platform is a spam intake with no
 * handle to rate-limit by.
 */
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const { error, sent } = await searchParams;

  const orgs = await getUserOrgs(supabase, user.id);

  // The submitter's own requests, through the select policy -- their own rows
  // and nothing else. Shown so that "did that send?" has an answer on the page
  // rather than only in an email that has not arrived yet.
  const { data: mine } = await supabase
    .from("support_requests")
    .select("id, subject, status, created_at")
    .eq("submitted_by_profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const c = copy.help;

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-10">
      <div>
        <PageHeader title={c.title} eyebrow={c.eyebrow} />
        <p className="mt-2 text-sm text-deep-slate/70">{c.intro}</p>
      </div>

      {/* ---------------------------------------------------------------- FAQ */}
      <section className="space-y-4">
        <h2 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-baked-clay">
          {c.faqHeading}
        </h2>
        {/* A seamed list, §7.7: hairline separators from the grid gap rather
            than borders on each item. */}
        <div className="grid gap-px bg-deep-slate/20">
          {c.faq.map((entry) => (
            <details key={entry.q} className="group bg-parchment p-4">
              <summary className="cursor-pointer list-none font-serif text-lg font-black uppercase leading-tight tracking-tight text-deep-slate marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta">
                {entry.q}
              </summary>
              <p className="mt-3 text-sm leading-6 text-deep-slate/80">{entry.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------- form */}
      <section className="space-y-4">
        <h2 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-baked-clay">
          {c.formHeading}
        </h2>
        <p className="text-sm text-deep-slate/70">{c.formIntro}</p>

        {sent ? (
          <p className="border-l-4 border-terracotta pl-4 text-sm text-deep-slate">{c.sent}</p>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}

        <Card>
          <form action={submitSupportRequest} className="space-y-4">
            <div>
              <Label htmlFor="support-org">{c.familyLabel}</Label>
              {/* Only the member's own Families are offered. The insert policy
                  checks that claim against memberships anyway -- a dropdown is
                  a suggestion to the browser, never a constraint on what can
                  reach the database. */}
              <Select name="org_id" id="support-org" defaultValue="">
                <option value="">{c.familyNone}</option>
                {orgs.map((org) => (
                  <option key={org.org_id} value={org.org_id}>
                    {org.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="support-subject">{c.subjectLabel}</Label>
              <Input type="text" name="subject" id="support-subject" required maxLength={200} />
            </div>
            <div>
              <Label htmlFor="support-body">{c.bodyLabel}</Label>
              <Textarea name="body" id="support-body" required rows={6} maxLength={4000} />
            </div>
            <Button type="submit" className="w-full">
              {c.submit}
            </Button>
          </form>
        </Card>
      </section>

      {/* ------------------------------------------------------ your messages */}
      <section className="space-y-4">
        <h2 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-baked-clay">
          {c.yoursHeading}
        </h2>
        {(mine ?? []).length === 0 ? (
          // Honest empty state: it says what is true, and invents nothing.
          <p className="text-sm text-deep-slate/70">{c.yoursEmpty}</p>
        ) : (
          <ul className="grid gap-px bg-deep-slate/20">
            {(mine ?? []).map((request) => (
              <li key={request.id} className="flex items-start justify-between gap-4 bg-parchment p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm text-deep-slate">{request.subject}</p>
                  {/* Ledger voice: metadata in monospace (§3.1). */}
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-deep-slate/50">
                    {new Date(request.created_at).toISOString().slice(0, 10)}
                  </p>
                </div>
                <StatusPip label={request.status === "handled" ? c.statusHandled : c.statusOpen} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
