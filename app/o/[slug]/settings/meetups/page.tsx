import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import {
  createMeetupSeries,
  generateOccurrences,
  createOneOffMeetup,
  markAttendance,
  unmarkAttendance,
} from "@/app/actions/meetups";
import { Button, Card, ErrorText, Input, Label, PageHeader, Select } from "@/components/ui";

export default async function MeetupsSettingsPage({
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

  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name")
    .eq("org_id", currentOrg.org_id)
    .order("name");

  const { data: series } = await supabase
    .from("meetup_series")
    .select("id, title, timezone, local_time, interval_weeks, next_occurrence_date")
    .eq("org_id", currentOrg.org_id)
    .is("deleted_at", null)
    .order("created_at");

  const { data: meetups } = await supabase
    .from("meetups")
    .select("id, title, starts_at, meeting_provider, meeting_url")
    .eq("org_id", currentOrg.org_id)
    .is("deleted_at", null)
    .order("starts_at");

  const { data: members } = await supabase
    .from("memberships")
    .select("profile_id, profiles(display_name)")
    .eq("org_id", currentOrg.org_id)
    .order("created_at");

  const meetupIds = (meetups ?? []).map((m) => m.id);

  const { data: rsvps } = meetupIds.length
    ? await supabase.from("meetup_rsvps").select("meetup_id, status").in("meetup_id", meetupIds)
    : { data: [] };

  const { data: attendance } = meetupIds.length
    ? await supabase
        .from("meetup_attendance")
        .select("id, meetup_id, profile_id, profiles!meetup_attendance_profile_id_fkey(display_name)")
        .in("meetup_id", meetupIds)
    : { data: [] };

  const rsvpCountsByMeetup = new Map<string, Record<string, number>>();
  for (const r of rsvps ?? []) {
    const counts = rsvpCountsByMeetup.get(r.meetup_id) ?? {};
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    rsvpCountsByMeetup.set(r.meetup_id, counts);
  }

  const attendanceByMeetup = new Map<string, typeof attendance>();
  for (const a of attendance ?? []) {
    attendanceByMeetup.set(a.meetup_id, [...(attendanceByMeetup.get(a.meetup_id) ?? []), a]);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-8">
      <PageHeader title="Meetups" />
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        <h2 className="mb-3 text-xl">Create a one-off meetup</h2>
        <form action={createOneOffMeetup} className="space-y-3">
          <input type="hidden" name="org_id" value={currentOrg.org_id} />
          <input type="hidden" name="org_slug" value={slug} />
          <div>
            <Label htmlFor="oneoff-title">Title</Label>
            <Input type="text" name="title" id="oneoff-title" required />
          </div>
          <div>
            <Label htmlFor="oneoff-description">Description</Label>
            <Input type="text" name="description" id="oneoff-description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="oneoff-provider">Meeting provider</Label>
              <Input type="text" name="meeting_provider" id="oneoff-provider" placeholder="zoom" required />
            </div>
            <div>
              <Label htmlFor="oneoff-url">Meeting URL</Label>
              <Input type="text" name="meeting_url" id="oneoff-url" />
            </div>
          </div>
          <div>
            <Label htmlFor="oneoff-cohort">Cohort (optional)</Label>
            <Select name="cohort_id" id="oneoff-cohort" defaultValue="">
              <option value="">Org-wide</option>
              {cohorts?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="oneoff-timezone">Timezone (IANA, e.g. America/New_York)</Label>
            <Input type="text" name="timezone" id="oneoff-timezone" defaultValue="UTC" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="oneoff-start-date">Start date</Label>
              <Input type="date" name="start_date" id="oneoff-start-date" required />
            </div>
            <div>
              <Label htmlFor="oneoff-start-time">Start time</Label>
              <Input type="time" name="start_time" id="oneoff-start-time" required />
            </div>
            <div>
              <Label htmlFor="oneoff-end-date">End date (optional)</Label>
              <Input type="date" name="end_date" id="oneoff-end-date" />
            </div>
            <div>
              <Label htmlFor="oneoff-end-time">End time (optional)</Label>
              <Input type="time" name="end_time" id="oneoff-end-time" />
            </div>
          </div>
          <Button type="submit">Create meetup</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Create a recurring series</h2>
        <form action={createMeetupSeries} className="space-y-3">
          <input type="hidden" name="org_id" value={currentOrg.org_id} />
          <input type="hidden" name="org_slug" value={slug} />
          <div>
            <Label htmlFor="series-title">Title</Label>
            <Input type="text" name="title" id="series-title" required />
          </div>
          <div>
            <Label htmlFor="series-description">Description</Label>
            <Input type="text" name="description" id="series-description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="series-provider">Meeting provider</Label>
              <Input type="text" name="meeting_provider" id="series-provider" placeholder="zoom" required />
            </div>
            <div>
              <Label htmlFor="series-url">Meeting URL</Label>
              <Input type="text" name="meeting_url" id="series-url" />
            </div>
          </div>
          <div>
            <Label htmlFor="series-cohort">Cohort (optional)</Label>
            <Select name="cohort_id" id="series-cohort" defaultValue="">
              <option value="">Org-wide</option>
              {cohorts?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="series-timezone">Timezone (IANA)</Label>
              <Input type="text" name="timezone" id="series-timezone" defaultValue="UTC" required />
            </div>
            <div>
              <Label htmlFor="series-local-time">Local time</Label>
              <Input type="time" name="local_time" id="series-local-time" required />
            </div>
            <div>
              <Label htmlFor="series-duration">Duration (minutes, optional)</Label>
              <Input type="number" name="duration_minutes" id="series-duration" />
            </div>
            <div>
              <Label htmlFor="series-interval">Repeats every (weeks)</Label>
              <Input type="number" name="interval_weeks" id="series-interval" defaultValue="1" min="1" required />
            </div>
          </div>
          <div>
            <Label htmlFor="series-starts-on">First occurrence date</Label>
            <Input type="date" name="starts_on" id="series-starts-on" required />
          </div>
          <Button type="submit">Create series</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Series</h2>
        {series?.length ? (
          <ul className="divide-y divide-deep-slate/15">
            {series.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span>
                  {s.title} — every {s.interval_weeks} week(s) at {s.local_time} ({s.timezone}), next on{" "}
                  {s.next_occurrence_date}
                </span>
                <form action={generateOccurrences} className="flex items-center gap-2">
                  <input type="hidden" name="series_id" value={s.id} />
                  <input type="hidden" name="org_slug" value={slug} />
                  <input type="hidden" name="occurrence_count" value="4" />
                  <Button type="submit" variant="ghost">
                    Generate next 4
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-deep-slate/70">None yet.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Upcoming and recent meetups</h2>
        {meetups?.length ? (
          <div className="space-y-4">
            {meetups.map((m) => {
              const counts = rsvpCountsByMeetup.get(m.id) ?? {};
              const attendees = attendanceByMeetup.get(m.id) ?? [];
              const attendeeIds = new Set(attendees.map((a) => a.profile_id));
              const notYetMarked = (members ?? []).filter((mem) => !attendeeIds.has(mem.profile_id));

              return (
                <div key={m.id} className="border-t border-deep-slate/20 pt-3 first:border-t-0 first:pt-0">
                  <p className="font-medium">{m.title}</p>
                  <p className="text-sm text-deep-slate/70">
                    {new Date(m.starts_at).toLocaleString()} — {m.meeting_provider}
                  </p>
                  <p className="text-sm text-deep-slate/70">
                    Going: {counts.going ?? 0} · Maybe: {counts.maybe ?? 0} · Not going: {counts.not_going ?? 0}
                  </p>

                  <p className="mt-2 text-sm">
                    Attended: {attendees.length ? attendees.map((a) => a.profiles?.display_name).join(", ") : "none marked yet"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {attendees.map((a) => (
                      <form key={a.id} action={unmarkAttendance}>
                        <input type="hidden" name="attendance_id" value={a.id} />
                        <input type="hidden" name="org_slug" value={slug} />
                        <button type="submit" className="text-xs text-deep-slate/70 underline">
                          Unmark {a.profiles?.display_name}
                        </button>
                      </form>
                    ))}
                  </div>

                  {notYetMarked.length > 0 && (
                    <form action={markAttendance} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="meetup_id" value={m.id} />
                      <input type="hidden" name="org_slug" value={slug} />
                      <Select name="profile_id" defaultValue="" className="max-w-48">
                        <option value="" disabled>
                          Mark present
                        </option>
                        {notYetMarked.map((mem) => (
                          <option key={mem.profile_id} value={mem.profile_id}>
                            {mem.profiles?.display_name}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="ghost">
                        Mark
                      </Button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-deep-slate/70">None yet.</p>
        )}
      </Card>
    </main>
  );
}
