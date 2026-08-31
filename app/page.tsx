import Link from "next/link";
import { redirect } from "next/navigation";
import { assuranceOutcome } from "@/lib/auth/assurance";
import { createClient } from "@/lib/supabase/server";
import { getPendingInvitations, getUserOrgs } from "@/lib/session";
import { acceptInvitation } from "@/app/actions/invitations";
import { signOut } from "@/app/actions/auth";
import { Button, Card, PageHeader } from "@/components/ui";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
        <PageHeader title="F4milia" />
        <p className="text-deep-slate/70">
          <Link href="/login" className="text-terracotta underline">
            Log in
          </Link>{" "}
          or{" "}
          <Link href="/signup" className="text-terracotta underline">
            sign up
          </Link>
          .
        </p>
      </main>
    );
  }

  /**
   * The two-factor gate, called explicitly (S2, invariant 7).
   *
   * This page cannot use requireUser() -- it renders a signed-OUT view above, and
   * requireUser redirects to /login instead of returning. So the gate has to be
   * invoked by hand here, and this was a real hole rather than a hypothetical
   * one: the browser spec for the staff gate failed on exactly this page, which
   * lists a member's Families and their pending invitations while every other
   * surface was correctly held.
   *
   * tests/assurance-gate.test.ts now walks app/ and fails if any page reads user
   * data without either requireUser() or this call, so the next page written like
   * this one is caught by a test rather than by a browser.
   */
  const outcome = await assuranceOutcome(supabase);
  if (!outcome.ok) {
    redirect(outcome.redirectTo);
  }

  const orgs = await getUserOrgs(supabase, user.id);
  const invitations = user.email ? await getPendingInvitations(supabase, user.email) : [];

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-8">
      <PageHeader
        title="F4milia"
        actions={
          <form action={signOut}>
            <Button type="submit" variant="ghost">
              Log out
            </Button>
          </form>
        }
      />
      <p className="text-deep-slate/70">
        Signed in as {user.email}.{" "}
        <Link href="/account/email" className="text-terracotta underline">
          Change address
        </Link>
        {" · "}
        <Link href="/settings/blocked" className="text-terracotta underline">
          Blocked people
        </Link>
      </p>

      {invitations.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-xl">Pending invitations</h2>
          <ul className="space-y-3">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-4">
                <span>
                  {inv.organizations?.name} — invited as {inv.role}
                </span>
                <form action={acceptInvitation}>
                  <input type="hidden" name="token" value={inv.token} />
                  <Button type="submit">Accept</Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-xl">Your communities</h2>
        {orgs.length === 0 ? (
          <p className="text-deep-slate/70">You&apos;re not a member of any community yet.</p>
        ) : (
          <ul className="space-y-2">
            {orgs.map((org) => (
              <li key={org.org_id} className="flex items-center justify-between border-b border-deep-slate/20 pb-2 last:border-0">
                <Link href={`/o/${org.slug}`} className="text-terracotta underline">
                  {org.name}
                </Link>
                <span className="text-sm text-deep-slate/70">{org.role}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
