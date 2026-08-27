import { requireUser, getUserOrgs } from "@/lib/session";
import { transitionMentorPairing } from "@/app/actions/mentorship";
import { Button, Card, ErrorText, PageHeader } from "@/components/ui";

export default async function MyMentorshipPage({
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
  const orgId = currentOrg?.org_id ?? "";

  const { data: pairings } = await supabase
    .from("mentor_pairings")
    .select(
      "id, status, mentor_profile_id, mentee_profile_id, mentor:profiles!mentor_pairings_mentor_profile_id_fkey(display_name), mentee:profiles!mentor_pairings_mentee_profile_id_fkey(display_name)",
    )
    .eq("org_id", orgId)
    .or(`mentor_profile_id.eq.${user.id},mentee_profile_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="My mentorship" />
      {error ? <ErrorText>{error}</ErrorText> : null}

      {!pairings?.length ? (
        <p className="text-deep-slate/70">No mentor pairings yet.</p>
      ) : (
        <div className="space-y-4">
          {pairings.map((p) => {
            const iAmMentor = p.mentor_profile_id === user.id;
            const otherName = iAmMentor ? p.mentee?.display_name : p.mentor?.display_name;
            const otherRoleLabel = iAmMentor ? "Mentee" : "Mentor";

            return (
              <Card key={p.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {otherRoleLabel}: {otherName}
                    </p>
                    <p className="text-sm text-deep-slate/70">{p.status}</p>
                  </div>
                  <div className="flex gap-2">
                    {p.status === "proposed" && iAmMentor && (
                      <form action={transitionMentorPairing}>
                        <input type="hidden" name="pairing_id" value={p.id} />
                        <input type="hidden" name="org_slug" value={slug} />
                        <input type="hidden" name="status" value="active" />
                        <Button type="submit">Accept</Button>
                      </form>
                    )}
                    {p.status === "proposed" && (
                      <form action={transitionMentorPairing}>
                        <input type="hidden" name="pairing_id" value={p.id} />
                        <input type="hidden" name="org_slug" value={slug} />
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
                        <input type="hidden" name="status" value="completed" />
                        <Button type="submit" variant="ghost">
                          Mark complete
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
