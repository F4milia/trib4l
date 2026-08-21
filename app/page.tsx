import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPendingInvitations, getUserOrgs } from "@/lib/session";
import { acceptInvitation } from "@/app/actions/invitations";
import { signOut } from "@/app/actions/auth";
import { Button, Card, PageHeading } from "@/components/ui";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
        <PageHeading>F4milia</PageHeading>
        <p className="text-ink-soft">
          <Link href="/login" className="text-primary underline">
            Log in
          </Link>{" "}
          or{" "}
          <Link href="/signup" className="text-primary underline">
            sign up
          </Link>
          .
        </p>
      </main>
    );
  }

  const orgs = await getUserOrgs(supabase, user.id);
  const invitations = user.email ? await getPendingInvitations(supabase, user.email) : [];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <PageHeading>F4milia</PageHeading>
        <form action={signOut}>
          <Button type="submit" variant="ghost">
            Log out
          </Button>
        </form>
      </div>
      <p className="text-ink-soft">Signed in as {user.email}.</p>

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
          <p className="text-ink-soft">You&apos;re not a member of any community yet.</p>
        ) : (
          <ul className="space-y-2">
            {orgs.map((org) => (
              <li key={org.org_id} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                <Link href={`/o/${org.slug}`} className="text-primary underline">
                  {org.name}
                </Link>
                <span className="text-sm text-ink-soft">{org.role}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
