import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, signInAs, signUpNewUser } from "./helpers";
import type { Database } from "../../lib/supabase/database.types";

type ReportInsert = Database["public"]["Tables"]["reports"]["Insert"];

describe("search", () => {
  it("full-text search respects the same cohort scoping as the feed", async () => {
    const bob = await signInAs(SEEDED_USERS.bob); // organizer, caregiver-circle
    const { data: bobId } = await bob.auth.getUser();

    const marker = `xylophone${Date.now()}`;
    const { data: cohort } = await bob
      .from("cohorts")
      .insert({ org_id: ORG_IDS.caregiverCircle, name: `Search cohort ${Date.now()}` })
      .select("id")
      .single();

    await bob
      .from("posts")
      .insert({ org_id: ORG_IDS.caregiverCircle, author_profile_id: bobId.user!.id, body: `org-wide ${marker} post` });
    await bob.from("posts").insert({
      org_id: ORG_IDS.caregiverCircle,
      cohort_id: cohort!.id,
      author_profile_id: bobId.user!.id,
      body: `cohort-only ${marker} post`,
    });

    // Bob (organizer) sees both, since staff see every cohort.
    const { data: bobResults } = await bob
      .from("posts")
      .select("id, body")
      .textSearch("search_vector", marker);
    expect(bobResults?.length).toBe(2);

    // A fresh org member (no cohort) sees only the org-wide one.
    const outsider = await signUpNewUser(`search-outsider-${Date.now()}@f4milia.test`);
    const { data: outsiderUser } = await outsider.auth.getUser();
    const { data: invite } = await bob
      .from("invitations")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        email: outsiderUser.user!.email!,
        role: "member",
        invited_by_profile_id: bobId.user!.id,
      })
      .select("token")
      .single();
    await outsider.rpc("accept_invitation", { invitation_token: invite!.token });

    const { data: outsiderResults } = await outsider
      .from("posts")
      .select("id, body")
      .textSearch("search_vector", marker);
    expect(outsiderResults?.length).toBe(1);
    expect(outsiderResults?.[0].body).toContain("org-wide");
  });
});

describe("member safety: reports", () => {
  it("a member can file a report, and it's visible to org staff", async () => {
    const alice = await signInAs(SEEDED_USERS.alice); // member, caregiver-circle
    const { data: aliceId } = await alice.auth.getUser();

    const { data: report, error } = await alice
      .from("reports")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        reporter_profile_id: aliceId.user!.id,
        target_type: "member",
        target_id: aliceId.user!.id, // arbitrary target for this test
        reason: "test report",
      } as ReportInsert)
      .select("id")
      .single();
    expect(error).toBeNull();

    const bob = await signInAs(SEEDED_USERS.bob); // organizer, same org
    const { data: seenByOrganizer } = await bob.from("reports").select("id").eq("id", report!.id).maybeSingle();
    expect(seenByOrganizer?.id).toBe(report!.id);
  });

  it("a report is invisible to other org members, only the reporter and staff", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: aliceId } = await alice.auth.getUser();
    const { data: report } = await alice
      .from("reports")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        reporter_profile_id: aliceId.user!.id,
        target_type: "member",
        target_id: aliceId.user!.id,
        reason: "private report",
      } as ReportInsert)
      .select("id")
      .single();

    const outsider = await signUpNewUser(`report-outsider-${Date.now()}@f4milia.test`);
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { data: outsiderUser } = await outsider.auth.getUser();
    const { data: invite } = await bob
      .from("invitations")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        email: outsiderUser.user!.email!,
        role: "member",
        invited_by_profile_id: bobId.user!.id,
      })
      .select("token")
      .single();
    await outsider.rpc("accept_invitation", { invitation_token: invite!.token });

    const { data: notVisible } = await outsider.from("reports").select("id").eq("id", report!.id).maybeSingle();
    expect(notVisible).toBeNull();
  });

  it("only org staff can resolve a report, not the reporter", async () => {
    // A fresh signup rather than seeded Alice: guaranteed to hold no role
    // another test file could have already promoted (Session 3's
    // invitations.test.ts durably promotes Alice to organizer within the
    // same run), which would make "reporter can't self-resolve" pass for
    // the wrong reason if she were actually staff by the time this runs.
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const reporter = await signUpNewUser(`plain-reporter-${Date.now()}@f4milia.test`);
    const { data: reporterUser } = await reporter.auth.getUser();
    const { data: invite } = await bob
      .from("invitations")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        email: reporterUser.user!.email!,
        role: "member",
        invited_by_profile_id: bobId.user!.id,
      })
      .select("token")
      .single();
    await reporter.rpc("accept_invitation", { invitation_token: invite!.token });

    const { data: report } = await reporter
      .from("reports")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        reporter_profile_id: reporterUser.user!.id,
        target_type: "member",
        target_id: reporterUser.user!.id,
        reason: "cannot self-resolve",
      } as ReportInsert)
      .select("id")
      .single();

    const { data: selfResolveAttempt } = await reporter
      .from("reports")
      .update({ status: "resolved" })
      .eq("id", report!.id)
      .select();
    expect(selfResolveAttempt).toEqual([]); // filtered by RLS, not an error

    const { error: organizerResolveError } = await bob
      .from("reports")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", report!.id);
    expect(organizerResolveError).toBeNull();
  });
});

describe("member safety: blocks", () => {
  it("a user can block another, see only their own block list, and unblock", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: aliceId } = await alice.auth.getUser();
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();

    const { error: blockError } = await alice
      .from("blocks")
      .insert({ blocker_profile_id: aliceId.user!.id, blocked_profile_id: bobId.user!.id });
    expect(blockError).toBeNull();

    // Bob cannot see that Alice blocked him -- blocks are visible only to
    // the blocker, not even to the blocked person.
    const { data: bobsView } = await bob
      .from("blocks")
      .select("id")
      .eq("blocked_profile_id", bobId.user!.id);
    expect(bobsView).toEqual([]);

    const { data: alicesView } = await alice
      .from("blocks")
      .select("blocked_profile_id")
      .eq("blocker_profile_id", aliceId.user!.id);
    expect(alicesView?.[0]?.blocked_profile_id).toBe(bobId.user!.id);

    const { error: unblockError } = await alice
      .from("blocks")
      .delete()
      .eq("blocker_profile_id", aliceId.user!.id)
      .eq("blocked_profile_id", bobId.user!.id);
    expect(unblockError).toBeNull();

    const { data: afterUnblock } = await alice.from("blocks").select("id");
    expect(afterUnblock).toEqual([]);
  });

  it("cannot block yourself", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: aliceId } = await alice.auth.getUser();

    const { error } = await alice
      .from("blocks")
      .insert({ blocker_profile_id: aliceId.user!.id, blocked_profile_id: aliceId.user!.id });
    expect(error).not.toBeNull();
  });

  it("cannot insert a block on someone else's behalf", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobId } = await bob.auth.getUser();
    const { data: aliceId } = await alice.auth.getUser();

    // Alice tries to make it look like Bob blocked her.
    const { error } = await alice
      .from("blocks")
      .insert({ blocker_profile_id: bobId.user!.id, blocked_profile_id: aliceId.user!.id });
    expect(error).not.toBeNull();
  });
});
