import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, createServiceRoleClient, signInAs, signUpNewUser } from "./helpers";
import type { Database } from "@/lib/supabase/database.types";

// org_id/created_by_profile_id on live_stream_credentials are
// trigger-derived from the referenced live stream -- these tests
// deliberately omit them, same cast used throughout this suite for
// trigger-derived columns.
type LiveStreamCredentialsInsert = Database["public"]["Tables"]["live_stream_credentials"]["Insert"];

const CAREGIVER_CIRCLE = ORG_IDS.caregiverCircle;
const FOUNDER_COLLECTIVE = ORG_IDS.founderCollective;

async function makeOrgMember(bob: Awaited<ReturnType<typeof signInAs>>, bobId: string, emailPrefix: string) {
  const person = await signUpNewUser(`${emailPrefix}-${Date.now()}@f4milia.test`);
  const { data: personUser } = await person.auth.getUser();
  const { data: invite } = await bob
    .from("invitations")
    .insert({
      org_id: CAREGIVER_CIRCLE,
      email: personUser.user!.email!,
      role: "member",
      invited_by_profile_id: bobId,
    })
    .select("token")
    .single();
  await person.rpc("accept_invitation", { invitation_token: invite!.token });
  return { client: person, id: personUser.user!.id };
}

/** Simulates exactly what the real webhook route's
 * video.live_stream.active/idle branches and the create-live-stream
 * server action's service-role linking step do -- no test here calls
 * the real Mux API. */
async function linkLiveStream(liveStreamId: string, muxLiveStreamId: string, playbackId: string) {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("live_streams")
    .update({ mux_live_stream_id: muxLiveStreamId, playback_id: playbackId, status: "active" })
    .eq("id", liveStreamId);
  if (error) throw new Error(`linkLiveStream failed: ${error.message}`);
}

/** Simulates the webhook route's video.asset.live_stream_completed
 * branch: creates the archived video_assets row and links it back. */
async function archiveLiveStream(liveStreamId: string, orgId: string, cohortId: string | null, requiredStageId: string | null, uploaderId: string) {
  const service = createServiceRoleClient();
  const { data: videoAsset, error } = await service
    .from("video_assets")
    .insert({
      org_id: orgId,
      cohort_id: cohortId,
      required_stage_id: requiredStageId,
      uploader_profile_id: uploaderId,
      status: "ready",
      moderation_state: "approved",
      playback_id: `archived-${Date.now()}`,
      duration_seconds: 1800,
    })
    .select("id")
    .single();
  if (error) throw new Error(`archiveLiveStream insert failed: ${error.message}`);

  const { error: linkError } = await service.from("live_streams").update({ video_asset_id: videoAsset!.id }).eq("id", liveStreamId);
  if (linkError) throw new Error(`archiveLiveStream link-back failed: ${linkError.message}`);
  return videoAsset!.id;
}

describe("live_streams", () => {
  it("staff can create a live stream; a plain member cannot", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { client: member } = await makeOrgMember(bob, bobId.user!.id, "ls-create-member");

    const { error: memberError } = await member.from("live_streams").insert({
      org_id: CAREGIVER_CIRCLE,
      title: "Should not exist",
      created_by_profile_id: (await member.auth.getUser()).data.user!.id,
    });
    expect(memberError).not.toBeNull();

    const { data: stream, error } = await bob
      .from("live_streams")
      .insert({ org_id: CAREGIVER_CIRCLE, title: `Support call ${Date.now()}`, created_by_profile_id: bobId.user!.id })
      .select("id, status")
      .single();
    expect(error).toBeNull();
    expect(stream?.status).toBe("idle");
  });

  it("a member cannot pre-declare a live stream's Mux identity or status", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { error: insertError } = await bob.from("live_streams").insert({
      org_id: CAREGIVER_CIRCLE,
      title: "Spoofed",
      created_by_profile_id: bobId.user!.id,
      mux_live_stream_id: "fake-id",
      playback_id: "stolen-playback-id",
      status: "active",
    });
    expect(insertError).not.toBeNull();

    const { data: stream } = await bob
      .from("live_streams")
      .insert({ org_id: CAREGIVER_CIRCLE, title: `Legit ${Date.now()}`, created_by_profile_id: bobId.user!.id })
      .select("id")
      .single();

    const { error: updateError } = await bob
      .from("live_streams")
      .update({ playback_id: "stolen-playback-id" })
      .eq("id", stream!.id);
    expect(updateError).not.toBeNull();

    // Title/description are the only columns this path may change.
    const { error: titleUpdateError } = await bob
      .from("live_streams")
      .update({ title: "Renamed" })
      .eq("id", stream!.id);
    expect(titleUpdateError).toBeNull();
  });

  it("done means (live streams): a member in one org cannot see another org's stream, including its playback_id", async () => {
    const bob = await signInAs(SEEDED_USERS.bob); // organizer, caregiver-circle
    const { data: bobId } = await bob.auth.getUser();
    const carol = await signInAs(SEEDED_USERS.carol); // org_owner, founder-collective
    const { data: carolId } = await carol.auth.getUser();

    const { client: caregiverMember } = await makeOrgMember(bob, bobId.user!.id, "ls-isolation");

    const { data: founderStream } = await carol
      .from("live_streams")
      .insert({ org_id: FOUNDER_COLLECTIVE, title: `Founder-only ${Date.now()}`, created_by_profile_id: carolId.user!.id })
      .select("id")
      .single();
    const playbackId = `founder-only-playback-${Date.now()}`;
    await linkLiveStream(founderStream!.id, `mux-live-${Date.now()}`, playbackId);

    const { data: crossOrgView } = await caregiverMember
      .from("live_streams")
      .select("id")
      .eq("id", founderStream!.id)
      .maybeSingle();
    expect(crossOrgView).toBeNull();

    const { data: byPlaybackId } = await caregiverMember
      .from("live_streams")
      .select("id")
      .eq("playback_id", playbackId)
      .maybeSingle();
    expect(byPlaybackId).toBeNull();

    const { data: ownerView } = await carol.from("live_streams").select("id").eq("playback_id", playbackId).maybeSingle();
    expect(ownerView?.id).toBe(founderStream!.id);
  });

  it("a cohort-scoped live stream is invisible outside the cohort; a stage-gated one is invisible below the gate", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { data: cohort } = await bob
      .from("cohorts")
      .insert({ org_id: CAREGIVER_CIRCLE, name: `Live cohort ${Date.now()}` })
      .select("id")
      .single();
    const { client: inCohort, id: inCohortId } = await makeOrgMember(bob, bobId.user!.id, "ls-cohort-in");
    await bob.from("cohort_members").insert({ org_id: CAREGIVER_CIRCLE, cohort_id: cohort!.id, profile_id: inCohortId });
    const { client: outOfCohort } = await makeOrgMember(bob, bobId.user!.id, "ls-cohort-out");

    const { data: cohortStream } = await bob
      .from("live_streams")
      .insert({
        org_id: CAREGIVER_CIRCLE,
        cohort_id: cohort!.id,
        title: `Cohort stream ${Date.now()}`,
        created_by_profile_id: bobId.user!.id,
      })
      .select("id")
      .single();

    const { data: inView } = await inCohort.from("live_streams").select("id").eq("id", cohortStream!.id).maybeSingle();
    expect(inView?.id).toBe(cohortStream!.id);
    const { data: outView } = await outOfCohort.from("live_streams").select("id").eq("id", cohortStream!.id).maybeSingle();
    expect(outView).toBeNull();

    const sortBase = Date.now() % 1000000;
    const { data: gateStage } = await bob
      .from("stages")
      .insert({ org_id: CAREGIVER_CIRCLE, name: `Live-gate-${sortBase}`, sort_order: sortBase })
      .select("id")
      .single();
    const { client: belowGate } = await makeOrgMember(bob, bobId.user!.id, "ls-stage-below");
    const { client: atGate, id: atGateId } = await makeOrgMember(bob, bobId.user!.id, "ls-stage-at");
    await bob.rpc("transition_member_stage", {
      target_org_id: CAREGIVER_CIRCLE,
      target_profile_id: atGateId,
      target_stage_id: gateStage!.id,
    });

    const { data: gatedStream } = await bob
      .from("live_streams")
      .insert({
        org_id: CAREGIVER_CIRCLE,
        required_stage_id: gateStage!.id,
        title: `Gated stream ${Date.now()}`,
        created_by_profile_id: bobId.user!.id,
      })
      .select("id")
      .single();

    const { data: belowView } = await belowGate.from("live_streams").select("id").eq("id", gatedStream!.id).maybeSingle();
    expect(belowView).toBeNull();
    const { data: atView } = await atGate.from("live_streams").select("id").eq("id", gatedStream!.id).maybeSingle();
    expect(atView?.id).toBe(gatedStream!.id);
  });

  it("stream_key is visible only to its creator and staff, never an outsider, and cannot be inserted directly", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { client: outsider } = await makeOrgMember(bob, bobId.user!.id, "ls-key-outsider");

    const { data: stream } = await bob
      .from("live_streams")
      .insert({ org_id: CAREGIVER_CIRCLE, title: `Key test ${Date.now()}`, created_by_profile_id: bobId.user!.id })
      .select("id")
      .single();

    const { error: directInsertError } = await bob
      .from("live_stream_credentials")
      .insert({ live_stream_id: stream!.id, stream_key: "hand-typed-key" } as unknown as LiveStreamCredentialsInsert);
    expect(directInsertError).not.toBeNull();

    const service = createServiceRoleClient();
    await service
      .from("live_stream_credentials")
      .insert({ live_stream_id: stream!.id, stream_key: "real-mux-key" } as unknown as LiveStreamCredentialsInsert);

    const { data: creatorView } = await bob
      .from("live_stream_credentials")
      .select("stream_key")
      .eq("live_stream_id", stream!.id)
      .maybeSingle();
    expect(creatorView?.stream_key).toBe("real-mux-key");

    const { data: outsiderView } = await outsider
      .from("live_stream_credentials")
      .select("stream_key")
      .eq("live_stream_id", stream!.id)
      .maybeSingle();
    expect(outsiderView).toBeNull();
  });

  it("shares one entitlement code path: the same stage gate that blocks the live stream also blocks its archived VOD", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const sortBase = (Date.now() + 1) % 1000000;
    const { data: gateStage } = await bob
      .from("stages")
      .insert({ org_id: CAREGIVER_CIRCLE, name: `Archive-gate-${sortBase}`, sort_order: sortBase })
      .select("id")
      .single();

    const { client: belowGate } = await makeOrgMember(bob, bobId.user!.id, "ls-archive-below");
    const { client: atGate, id: atGateId } = await makeOrgMember(bob, bobId.user!.id, "ls-archive-at");
    await bob.rpc("transition_member_stage", {
      target_org_id: CAREGIVER_CIRCLE,
      target_profile_id: atGateId,
      target_stage_id: gateStage!.id,
    });

    const { data: stream } = await bob
      .from("live_streams")
      .insert({
        org_id: CAREGIVER_CIRCLE,
        required_stage_id: gateStage!.id,
        title: `Archived and gated ${Date.now()}`,
        created_by_profile_id: bobId.user!.id,
      })
      .select("id")
      .single();

    const videoAssetId = await archiveLiveStream(stream!.id, CAREGIVER_CIRCLE, null, gateStage!.id, bobId.user!.id);

    const { data: belowVodView } = await belowGate.from("video_assets").select("id").eq("id", videoAssetId).maybeSingle();
    expect(belowVodView).toBeNull();

    const { data: atVodView } = await atGate.from("video_assets").select("id").eq("id", videoAssetId).maybeSingle();
    expect(atVodView?.id).toBe(videoAssetId);

    const { data: linkedStream } = await bob.from("live_streams").select("video_asset_id").eq("id", stream!.id).single();
    expect(linkedStream?.video_asset_id).toBe(videoAssetId);
  });
});
