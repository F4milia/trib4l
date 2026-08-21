import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPendingInvitations, getUserOrgs } from "@/lib/session";
import { acceptInvitation } from "@/app/actions/invitations";
import { signOut } from "@/app/actions/auth";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return (
      <main>
        <h1>F4milia</h1>
        <p>
          <a href="/login">Log in</a> or <a href="/signup">sign up</a>.
        </p>
      </main>
    );
  }

  const orgs = await getUserOrgs(supabase, user.id);
  const invitations = user.email ? await getPendingInvitations(supabase, user.email) : [];

  return (
    <main>
      <h1>F4milia</h1>
      <p>Signed in as {user.email}.</p>
      <form action={signOut}>
        <button type="submit">Log out</button>
      </form>

      {invitations.length > 0 ? (
        <section>
          <h2>Pending invitations</h2>
          <ul>
            {invitations.map((inv) => (
              <li key={inv.id}>
                {inv.organizations?.name} — invited as {inv.role}{" "}
                <form action={acceptInvitation} style={{ display: "inline" }}>
                  <input type="hidden" name="token" value={inv.token} />
                  <button type="submit">Accept</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>Your communities</h2>
        {orgs.length === 0 ? (
          <p>You&apos;re not a member of any community yet.</p>
        ) : (
          <ul>
            {orgs.map((org) => (
              <li key={org.org_id}>
                <Link href={`/o/${org.slug}`}>{org.name}</Link> ({org.role})
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
