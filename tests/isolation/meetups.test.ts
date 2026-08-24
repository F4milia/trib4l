import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, signInAs, signUpNewUser } from "./helpers";
import type { Database } from "@/lib/supabase/database.types";

// meetup_rsvps.org_id/cohort_id and meetup_attendance.org_id/cohort_id are
// trigger-derived from the referenced meetup (see the migration) -- these
// tests deliberately omit them, same cast used by
// tests/isolation/posts.test.ts for comments/reactions.
type RsvpInsert = Database["public"]["Tables"]["meetup_rsvps"]["Insert"];
type AttendanceInsert = Database["public"]["Tables"]["meetup_attendance"]["Insert"];

const ORG_ID = ORG_IDS.caregiverCircle;

async function makeOrgMember(bob: Awaited<ReturnType<typeof signInAs>>, bobId: string, emailPrefix: string) {
  const person = await signUpNewUser(`${emailPrefix}-${Date.now()}@f4milia.test`);
  const { data: personUser } = await person.auth.getUser();
  const { data: invite } = await bob
    .from("invitations")
    .insert({
      org_id: ORG_ID,
      email: personUser.user!.email!,
      role: "member",
      invited_by_profile_id: bobId,
    })
    .select("token")
    .single();
  await person.rpc("accept_invitation", { invitation_token: invite!.token });
  return { client: person, id: personUser.user!.id };
}

describe("meetups", () => {
  it("staff can create a one-off meetup; a plain member cannot", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { client: member } = await makeOrgMember(bob, bobId.user!.id, "oneoff-member");

    const { error: memberError } = await member.from("meetups").insert({
      org_id: ORG_ID,
      title: "Should not exist",
      meeting_provider: "zoom",
      starts_at: new Date().toISOString(),
    });
    expect(memberError).not.toBeNull();

    const { data: meetup, error } = await bob
      .from("meetups")
      .insert({
        org_id: ORG_ID,
        title: `Support call ${Date.now()}`,
        meeting_provider: "zoom",
        meeting_url: "https://zoom.example/abc",
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(meetup?.id).not.toBeNull();
  });

  it("generate_meetup_occurrences preserves local wall-clock time across a DST transition", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    // US spring-forward in 2026 is March 8. A weekly series starting the
    // Saturday before, at 18:00 America/New_York, generates one
    // occurrence before the transition and one after -- if recurrence
    // added a fixed UTC interval instead of reinterpreting local time per
    // occurrence, the second occurrence's UTC offset would be wrong by an
    // hour relative to the stated 18:00 local time.
    const { data: series, error: seriesError } = await bob
      .from("meetup_series")
      .insert({
        org_id: ORG_ID,
        title: `DST check ${Date.now()}`,
        meeting_provider: "zoom",
        timezone: "America/New_York",
        local_time: "18:00",
        interval_weeks: 1,
        next_occurrence_date: "2026-03-07",
        created_by_profile_id: bobId.user!.id,
      })
      .select("id")
      .single();
    expect(seriesError).toBeNull();

    const { data: occurrences, error } = await bob.rpc("generate_meetup_occurrences", {
      target_series_id: series!.id,
      occurrence_count: 2,
    });
    expect(error).toBeNull();
    expect(occurrences).toHaveLength(2);

    const [before, after] = occurrences!.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    expect(new Date(before.starts_at).toISOString()).toBe("2026-03-07T23:00:00.000Z"); // 6pm EST = UTC-5
    expect(new Date(after.starts_at).toISOString()).toBe("2026-03-14T22:00:00.000Z"); // 6pm EDT = UTC-4

    const { data: updatedSeries } = await bob
      .from("meetup_series")
      .select("next_occurrence_date")
      .eq("id", series!.id)
      .single();
    expect(updatedSeries?.next_occurrence_date).toBe("2026-03-21");
  });

  it("a member can RSVP to a visible meetup only as themselves", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { client: member, id: memberId } = await makeOrgMember(bob, bobId.user!.id, "rsvp-member");
    const { id: otherId } = await makeOrgMember(bob, bobId.user!.id, "rsvp-other");

    const { data: meetup } = await bob
      .from("meetups")
      .insert({
        org_id: ORG_ID,
        title: `RSVP test ${Date.now()}`,
        meeting_provider: "zoom",
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();

    const { error: spoofError } = await member.from("meetup_rsvps").insert({
      meetup_id: meetup!.id,
      profile_id: otherId,
      status: "going",
    } as unknown as RsvpInsert);
    expect(spoofError).not.toBeNull();

    const { data: rsvp, error } = await member
      .from("meetup_rsvps")
      .insert({ meetup_id: meetup!.id, profile_id: memberId, status: "going" } as unknown as RsvpInsert)
      .select("status, org_id")
      .single();
    expect(error).toBeNull();
    expect(rsvp?.status).toBe("going");
    expect(rsvp?.org_id).toBe(ORG_ID); // trigger-derived, not client-supplied

    // Changing your mind updates the same row rather than creating a
    // second one.
    const { error: updateError } = await member
      .from("meetup_rsvps")
      .update({ status: "not_going" })
      .eq("meetup_id", meetup!.id)
      .eq("profile_id", memberId);
    expect(updateError).toBeNull();

    const { data: rsvps } = await bob.from("meetup_rsvps").select("status").eq("meetup_id", meetup!.id);
    expect(rsvps).toHaveLength(1);
    expect(rsvps?.[0].status).toBe("not_going");
  });

  it("an RSVP is visible to its owner and staff, not to an unrelated member", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { client: member, id: memberId } = await makeOrgMember(bob, bobId.user!.id, "rsvp-visibility");
    const { client: outsider } = await makeOrgMember(bob, bobId.user!.id, "rsvp-visibility-outsider");

    const { data: meetup } = await bob
      .from("meetups")
      .insert({
        org_id: ORG_ID,
        title: `RSVP visibility ${Date.now()}`,
        meeting_provider: "zoom",
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();

    await member
      .from("meetup_rsvps")
      .insert({ meetup_id: meetup!.id, profile_id: memberId, status: "maybe" } as unknown as RsvpInsert);

    const { data: ownView } = await member.from("meetup_rsvps").select("id").eq("meetup_id", meetup!.id).maybeSingle();
    expect(ownView).not.toBeNull();

    const { data: staffView } = await bob.from("meetup_rsvps").select("id").eq("meetup_id", meetup!.id).maybeSingle();
    expect(staffView).not.toBeNull();

    const { data: outsiderView } = await outsider
      .from("meetup_rsvps")
      .select("id")
      .eq("meetup_id", meetup!.id)
      .maybeSingle();
    expect(outsiderView).toBeNull();
  });

  it("only staff mark attendance; the marked person and staff can see it, an unrelated member cannot", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { client: attendee, id: attendeeId } = await makeOrgMember(bob, bobId.user!.id, "attendance-member");
    const { client: outsider } = await makeOrgMember(bob, bobId.user!.id, "attendance-outsider");

    const { data: meetup } = await bob
      .from("meetups")
      .insert({
        org_id: ORG_ID,
        title: `Attendance test ${Date.now()}`,
        meeting_provider: "zoom",
        starts_at: new Date(Date.now() - 3_600_000).toISOString(), // already happened
      })
      .select("id")
      .single();

    const { error: selfMarkError } = await attendee.from("meetup_attendance").insert({
      meetup_id: meetup!.id,
      profile_id: attendeeId,
    } as unknown as AttendanceInsert);
    expect(selfMarkError).not.toBeNull();

    const { data: marked, error } = await bob
      .from("meetup_attendance")
      .insert(
        { meetup_id: meetup!.id, profile_id: attendeeId, marked_by_profile_id: bobId.user!.id } as unknown as AttendanceInsert,
      )
      .select("id, org_id")
      .single();
    expect(error).toBeNull();
    expect(marked?.org_id).toBe(ORG_ID);

    const { data: ownView } = await attendee
      .from("meetup_attendance")
      .select("id")
      .eq("id", marked!.id)
      .maybeSingle();
    expect(ownView?.id).toBe(marked!.id);

    const { data: staffView } = await bob.from("meetup_attendance").select("id").eq("id", marked!.id).maybeSingle();
    expect(staffView?.id).toBe(marked!.id);

    const { data: outsiderView } = await outsider
      .from("meetup_attendance")
      .select("id")
      .eq("id", marked!.id)
      .maybeSingle();
    expect(outsiderView).toBeNull();

    const { error: unmarkError } = await bob.from("meetup_attendance").delete().eq("id", marked!.id);
    expect(unmarkError).toBeNull();
  });

  it("a cohort-scoped meetup is invisible to a member outside the cohort", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { data: cohort } = await bob
      .from("cohorts")
      .insert({ org_id: ORG_ID, name: `Meetup cohort ${Date.now()}` })
      .select("id")
      .single();

    const { client: inCohort, id: inCohortId } = await makeOrgMember(bob, bobId.user!.id, "cohort-meetup-in");
    await bob.from("cohort_members").insert({ org_id: ORG_ID, cohort_id: cohort!.id, profile_id: inCohortId });

    const { client: outOfCohort } = await makeOrgMember(bob, bobId.user!.id, "cohort-meetup-out");

    const { data: meetup } = await bob
      .from("meetups")
      .insert({
        org_id: ORG_ID,
        cohort_id: cohort!.id,
        title: `Cohort meetup ${Date.now()}`,
        meeting_provider: "zoom",
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();

    const { data: inView } = await inCohort.from("meetups").select("id").eq("id", meetup!.id).maybeSingle();
    expect(inView?.id).toBe(meetup!.id);

    const { data: outView } = await outOfCohort.from("meetups").select("id").eq("id", meetup!.id).maybeSingle();
    expect(outView).toBeNull();
  });
});
