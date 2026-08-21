import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { designateMentor, proposeMentorPairing, transitionMentorPairing } from "@/app/actions/mentorship";
import { Button, Card, ErrorText, PageHeading, Select } from "@/components/ui";

export default async function MentorshipSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireUser();

  const orgs = await getUserOrgs(supabase, (await supabase.auth.getUser()).data.user!.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  if (!currentOrg || (currentOrg.role !== "organizer" && currentOrg.role !== "org_owner")) {
    redirect(`/o/${slug}`);
  }

  const { data: members } = await supabase
    .from("memberships")
    .select("profile_id, role, profiles(display_name)")
    .eq("org_id", currentOrg.org_id)
    .order("created_at");

  const plainMembers = (members ?? []).filter((m) => m.role === "member");
  const mentors = (members ?? []).filter((m) => m.role === "mentor");

  const { data: pairings } = await supabase
    .from("mentor_pairings")
    .select(
      "id, status, mentor:profiles!mentor_pairings_mentor_profile_id_fkey(display_name), mentee:profiles!mentor_pairings_mentee_profile_id_fkey(display_name)",
    )
    .eq("org_id", currentOrg.org_id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      <PageHeading>Mentorship</PageHeading>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        <h2 className="mb-3 text-xl">Mentors</h2>
        {mentors.length ? (
          <ul className="divide-y divide-line">
            {mentors.map((m) => (
              <li key={m.profile_id} className="py-2">
                {m.profiles?.display_name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-soft">None yet.</p>
        )}
      </Card>

      {currentOrg.role === "org_owner" && (
        <Card>
          <h2 className="mb-3 text-xl">Designate a mentor</h2>
          {/* Restricted to org_owner: memberships_update (Session 2) only
              permits org_owner to change an existing member's role, so an
              organizer submitting this would always fail -- hidden here
              rather than shown and erroring. */}
          {plainMembers.length ? (
            <form action={designateMentor} className="flex items-end gap-3">
              <input type="hidden" name="org_id" value={currentOrg.org_id} />
              <input type="hidden" name="org_slug" value={slug} />
              <Select name="profile_id" defaultValue="" className="max-w-56">
                <option value="" disabled>
                  Choose a member
                </option>
                {plainMembers.map((m) => (
                  <option key={m.profile_id} value={m.profile_id}>
                    {m.profiles?.display_name}
                  </option>
                ))}
              </Select>
              <Button type="submit">Designate as mentor</Button>
            </form>
          ) : (
            <p className="text-ink-soft">No plain members left to designate.</p>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-xl">Propose a pairing</h2>
        {!mentors.length ? (
          <p className="text-ink-soft">Designate a mentor first.</p>
        ) : (
          <form action={proposeMentorPairing} className="flex items-end gap-3">
            <input type="hidden" name="org_id" value={currentOrg.org_id} />
            <input type="hidden" name="org_slug" value={slug} />
            <Select name="mentor_profile_id" defaultValue="" className="max-w-48">
              <option value="" disabled>
                Mentor
              </option>
              {mentors.map((m) => (
                <option key={m.profile_id} value={m.profile_id}>
                  {m.profiles?.display_name}
                </option>
              ))}
            </Select>
            <Select name="mentee_profile_id" defaultValue="" className="max-w-48">
              <option value="" disabled>
                Mentee
              </option>
              {(members ?? []).map((m) => (
                <option key={m.profile_id} value={m.profile_id}>
                  {m.profiles?.display_name}
                </option>
              ))}
            </Select>
            <Button type="submit">Propose</Button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Pairings</h2>
        {pairings?.length ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink-soft">
                <th className="py-2 font-medium">Mentor</th>
                <th className="py-2 font-medium">Mentee</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Staff action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pairings.map((p) => (
                <tr key={p.id}>
                  <td className="py-2">{p.mentor?.display_name}</td>
                  <td className="py-2">{p.mentee?.display_name}</td>
                  <td className="py-2 text-ink-soft">{p.status}</td>
                  <td className="py-2">
                    {p.status === "proposed" && (
                      <form action={transitionMentorPairing}>
                        <input type="hidden" name="pairing_id" value={p.id} />
                        <input type="hidden" name="org_slug" value={slug} />
                        <input type="hidden" name="view" value="settings" />
                        <input type="hidden" name="status" value="declined" />
                        <Button type="submit" variant="danger">
                          Decline
                        </Button>
                      </form>
                    )}
                    {p.status === "active" && (
                      <form action={transitionMentorPairing}>
                        <input type="hidden" name="pairing_id" value={p.id} />
                        <input type="hidden" name="org_slug" value={slug} />
                        <input type="hidden" name="view" value="settings" />
                        <input type="hidden" name="status" value="completed" />
                        <Button type="submit" variant="ghost">
                          Mark complete
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-ink-soft">None yet.</p>
        )}
      </Card>
    </main>
  );
}
