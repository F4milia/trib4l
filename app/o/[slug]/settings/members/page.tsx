import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { createInvitation, revokeInvitation } from "@/app/actions/invitations";

export default async function MembersSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { supabase, user } = await requireUser();

  const orgs = await getUserOrgs(supabase, user.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  if (!currentOrg || (currentOrg.role !== "organizer" && currentOrg.role !== "org_owner")) {
    redirect(`/o/${slug}`);
  }

  const { data: members } = await supabase
    .from("memberships")
    .select("role, profiles(display_name)")
    .eq("org_id", currentOrg.org_id)
    .order("created_at");

  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, email, role, status")
    .eq("org_id", currentOrg.org_id)
    .eq("status", "pending")
    .order("created_at");

  return (
    <main>
      <h1>Members</h1>
      {error ? <p role="alert">{error}</p> : null}

      <section>
        <h2>Current members</h2>
        <ul>
          {members?.map((m, i) => (
            <li key={i}>
              {m.profiles?.display_name} — {m.role}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Pending invitations</h2>
        {invitations?.length ? (
          <ul>
            {invitations.map((inv) => (
              <li key={inv.id}>
                {inv.email} — invited as {inv.role}{" "}
                <form action={revokeInvitation} style={{ display: "inline" }}>
                  <input type="hidden" name="invitation_id" value={inv.id} />
                  <input type="hidden" name="org_slug" value={slug} />
                  <button type="submit">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p>None.</p>
        )}
      </section>

      <section>
        <h2>Invite someone</h2>
        <form action={createInvitation}>
          <input type="hidden" name="org_id" value={currentOrg.org_id} />
          <input type="hidden" name="org_slug" value={slug} />
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <label>
            Role
            <select name="role" defaultValue="member">
              <option value="member">Member</option>
              <option value="mentor">Mentor</option>
              <option value="organizer">Organizer</option>
              {currentOrg.role === "org_owner" && <option value="org_owner">Org owner</option>}
            </select>
          </label>
          <button type="submit">Send invitation</button>
        </form>
      </section>
    </main>
  );
}
