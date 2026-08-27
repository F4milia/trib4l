import { requireUser, getUserOrgs } from "@/lib/session";
import { upsertRsvp } from "@/app/actions/meetups";
import { Button, Card, ErrorText, PageHeader, Select } from "@/components/ui";

export default async function MeetupsPage({
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

  const { data: meetups } = await supabase
    .from("meetups")
    .select("id, title, description, meeting_provider, meeting_url, starts_at, ends_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");

  const meetupIds = (meetups ?? []).map((m) => m.id);
  const { data: myRsvps } = meetupIds.length
    ? await supabase.from("meetup_rsvps").select("meetup_id, status").eq("profile_id", user.id).in("meetup_id", meetupIds)
    : { data: [] };
  const myStatusByMeetup = new Map((myRsvps ?? []).map((r) => [r.meetup_id, r.status]));

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="Meetups" />
      {error ? <ErrorText>{error}</ErrorText> : null}

      {!meetups?.length ? (
        <p className="text-deep-slate/70">No upcoming meetups.</p>
      ) : (
        <div className="space-y-4">
          {meetups.map((m) => (
            <Card key={m.id}>
              <p className="font-medium">{m.title}</p>
              <p className="text-sm text-deep-slate/70">{new Date(m.starts_at).toLocaleString()}</p>
              {m.description && <p className="mt-2 text-sm">{m.description}</p>}
              <p className="mt-2 text-sm">
                {m.meeting_provider}
                {m.meeting_url && (
                  <>
                    {" — "}
                    <a href={m.meeting_url} className="text-terracotta underline">
                      Join link
                    </a>
                  </>
                )}
              </p>
              <form action={upsertRsvp} className="mt-3 flex items-center gap-2">
                <input type="hidden" name="meetup_id" value={m.id} />
                <input type="hidden" name="org_slug" value={slug} />
                <Select name="status" defaultValue={myStatusByMeetup.get(m.id) ?? ""} className="max-w-40">
                  <option value="" disabled>
                    RSVP
                  </option>
                  <option value="going">Going</option>
                  <option value="maybe">Maybe</option>
                  <option value="not_going">Not going</option>
                </Select>
                <Button type="submit">Save RSVP</Button>
              </form>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
