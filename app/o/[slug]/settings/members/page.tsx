import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { createInvitation, revokeInvitation } from "@/app/actions/invitations";
import { Button, Card, ErrorText, Input, Label, PageHeading, Select } from "@/components/ui";

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
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      <PageHeading>Invitations</PageHeading>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        <h2 className="mb-3 text-xl">Current members</h2>
        <ul className="divide-y divide-line">
          {members?.map((m, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <span>{m.profiles?.display_name}</span>
              <span className="text-sm text-ink-soft">{m.role}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Pending invitations</h2>
        {invitations?.length ? (
          <ul className="divide-y divide-line">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-2">
                <span>
                  {inv.email} — invited as {inv.role}
                </span>
                <form action={revokeInvitation}>
                  <input type="hidden" name="invitation_id" value={inv.id} />
                  <input type="hidden" name="org_slug" value={slug} />
                  <Button type="submit" variant="danger">
                    Revoke
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-soft">None.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Invite someone</h2>
        <form action={createInvitation} className="space-y-4">
          <input type="hidden" name="org_id" value={currentOrg.org_id} />
          <input type="hidden" name="org_slug" value={slug} />
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input type="email" name="email" id="invite-email" required />
          </div>
          <div>
            <Label htmlFor="invite-role">Role</Label>
            <Select name="role" id="invite-role" defaultValue="member">
              <option value="member">Member</option>
              <option value="mentor">Mentor</option>
              <option value="organizer">Organizer</option>
              {currentOrg.role === "org_owner" && <option value="org_owner">Org owner</option>}
            </Select>
          </div>
          <Button type="submit">Send invitation</Button>
        </form>
      </Card>
    </main>
  );
}
