"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// org_id/cohort_id on meetup_rsvps/meetup_attendance are trigger-derived
// from the referenced meetup (see the migration) -- the generated Insert
// types don't know about triggers, so they mark those columns required;
// this cast is the honest way to tell TypeScript "the database fills
// this in," matching the same pattern used for comments/reactions.
type RsvpInsert = Database["public"]["Tables"]["meetup_rsvps"]["Insert"];
type AttendanceInsert = Database["public"]["Tables"]["meetup_attendance"]["Insert"];

export async function createMeetupSeries(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const cohortId = String(formData.get("cohort_id") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const meetingProvider = String(formData.get("meeting_provider") ?? "").trim();
  const meetingUrl = String(formData.get("meeting_url") ?? "").trim() || null;
  const timezone = String(formData.get("timezone") ?? "").trim();
  const localTime = String(formData.get("local_time") ?? "");
  const durationMinutes = formData.get("duration_minutes")
    ? Number(formData.get("duration_minutes"))
    : null;
  const intervalWeeks = Number(formData.get("interval_weeks") ?? "1");
  const startsOn = String(formData.get("starts_on") ?? "");

  if (!title || !meetingProvider || !timezone || !localTime || !startsOn) {
    redirect(`/o/${orgSlug}/settings/meetups?error=${encodeURIComponent("Title, provider, timezone, time, and start date are required.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("meetup_series").insert({
    org_id: orgId,
    cohort_id: cohortId,
    title,
    description,
    meeting_provider: meetingProvider,
    meeting_url: meetingUrl,
    timezone,
    local_time: localTime,
    duration_minutes: durationMinutes,
    interval_weeks: intervalWeeks,
    next_occurrence_date: startsOn,
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/meetups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/meetups`);
  redirect(`/o/${orgSlug}/settings/meetups`);
}

export async function generateOccurrences(formData: FormData) {
  const seriesId = String(formData.get("series_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const occurrenceCount = Number(formData.get("occurrence_count") ?? "4");

  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_meetup_occurrences", {
    target_series_id: seriesId,
    occurrence_count: occurrenceCount,
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/meetups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/meetups`);
  revalidatePath(`/o/${orgSlug}/meetups`);
  redirect(`/o/${orgSlug}/settings/meetups`);
}

export async function createOneOffMeetup(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const cohortId = String(formData.get("cohort_id") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const meetingProvider = String(formData.get("meeting_provider") ?? "").trim();
  const meetingUrl = String(formData.get("meeting_url") ?? "").trim() || null;
  const timezone = String(formData.get("timezone") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endDate = String(formData.get("end_date") ?? "") || null;
  const endTime = String(formData.get("end_time") ?? "") || null;

  if (!title || !meetingProvider || !timezone || !startDate || !startTime) {
    redirect(`/o/${orgSlug}/settings/meetups?error=${encodeURIComponent("Title, provider, timezone, and a start date/time are required.")}`);
  }

  const supabase = await createClient();

  const { data: startsAt, error: startError } = await supabase.rpc("local_datetime_to_utc", {
    local_date: startDate,
    local_time: startTime,
    tz: timezone,
  });
  if (startError) {
    redirect(`/o/${orgSlug}/settings/meetups?error=${encodeURIComponent(startError.message)}`);
  }

  let endsAt: string | null = null;
  if (endDate && endTime) {
    const { data, error: endError } = await supabase.rpc("local_datetime_to_utc", {
      local_date: endDate,
      local_time: endTime,
      tz: timezone,
    });
    if (endError) {
      redirect(`/o/${orgSlug}/settings/meetups?error=${encodeURIComponent(endError.message)}`);
    }
    endsAt = data;
  }

  const { error } = await supabase.from("meetups").insert({
    org_id: orgId,
    cohort_id: cohortId,
    title,
    description,
    meeting_provider: meetingProvider,
    meeting_url: meetingUrl,
    starts_at: startsAt,
    ends_at: endsAt,
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/meetups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/meetups`);
  revalidatePath(`/o/${orgSlug}/meetups`);
  redirect(`/o/${orgSlug}/settings/meetups`);
}

export async function upsertRsvp(formData: FormData) {
  const meetupId = String(formData.get("meetup_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const status = String(formData.get("status") ?? "");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { error } = await supabase
    .from("meetup_rsvps")
    .upsert(
      { meetup_id: meetupId, profile_id: userData.user.id, status } as unknown as RsvpInsert,
      { onConflict: "meetup_id,profile_id" },
    );

  if (error) {
    redirect(`/o/${orgSlug}/meetups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/meetups`);
  redirect(`/o/${orgSlug}/meetups`);
}

export async function markAttendance(formData: FormData) {
  const meetupId = String(formData.get("meetup_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const profileId = String(formData.get("profile_id") ?? "");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { error } = await supabase.from("meetup_attendance").insert({
    meetup_id: meetupId,
    profile_id: profileId,
    marked_by_profile_id: userData.user.id,
  } as unknown as AttendanceInsert);

  if (error) {
    redirect(`/o/${orgSlug}/settings/meetups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/meetups`);
  redirect(`/o/${orgSlug}/settings/meetups`);
}

export async function unmarkAttendance(formData: FormData) {
  const attendanceId = String(formData.get("attendance_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("meetup_attendance").delete().eq("id", attendanceId);

  if (error) {
    redirect(`/o/${orgSlug}/settings/meetups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/o/${orgSlug}/settings/meetups`);
  redirect(`/o/${orgSlug}/settings/meetups`);
}
