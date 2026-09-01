import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { Database } from "../../lib/supabase/database.types";
import { withAdminAudit } from "../../lib/audit";
import {
  ORG_IDS,
  SEEDED_USERS,
  TEST_CAPTCHA,
  createServiceRoleClient,
  elevateToAal2,
  signInAs,
} from "./helpers";

// H1's named edge case for the 09:30 review:
//
//   "A user in no Family submits the form -- routes to staff, audit row
//    written."
//
// Every other isolation file in this repo tests that a member cannot reach
// outside their Family. This one tests the opposite direction, and it is the
// harder thing to get right: somebody with NO Family must still be able to
// reach the platform. A tidy-looking is_org_member() on the insert policy
// would close the only support channel a brand-new signup has, and it would
// look like good practice in review.
const FAMILY_A = ORG_IDS.caregiverCircle;

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/** Every staff account this file elevated, so it can put them back afterwards. */
const staffElevated = new Set<string>();

/**
 * Leaves the seeded staff accounts as this file found them: with no MFA factor.
 *
 * Without this, the file is self-healing at everyone else's expense. It clears
 * a stale factor before enrolling its own, so IT always passes -- and then
 * leaves a verified factor behind, so tests/isolation/platform-admin.test.ts
 * fails with "AAL2 required to enroll a new factor" on three cases that have
 * nothing to do with support requests. Reproduced deliberately: this file
 * green at 13/13, then that one red at 3.
 *
 * Cleaning up before yourself is not the same as cleaning up after yourself,
 * and in a suite that shares one database only the second one is neighbourly.
 */
afterAll(async () => {
  const service = createServiceRoleClient();
  for (const profileId of staffElevated) {
    const { data } = await service.auth.admin.getUserById(profileId);
    for (const factor of data?.user?.factors ?? []) {
      await service.auth.admin.mfa.deleteFactor({ id: factor.id, userId: profileId });
    }
  }
});

/**
 * Signs in a seeded platform_staff account and gets it to aal2, clearing any
 * MFA factor a previous run left behind first.
 *
 * helpers.ts's elevateToAal2() enrolls a new factor, and Supabase refuses to
 * enroll a second one below aal2 -- so once any run has enrolled a factor for
 * erin or frank, every later run fails with "AAL2 required to enroll a new
 * factor" until somebody resets the database. That makes the shared helper
 * work only immediately after `supabase db reset`, which is fine for CI and
 * useless the moment two people share a stack.
 *
 * Deleting the old factors through the admin API first makes this file green on
 * a database that has already run it -- the same re-runnability Q4 asks for,
 * and the reason this lives here rather than as an edit to helpers.ts, which
 * five of Stream A's open PRs are currently changing.
 */
async function signInAsStaffWithMfa(user: { email: string; password: string }) {
  const client = await signInAs(user);
  const { data: userData } = await client.auth.getUser();
  const profileId = userData.user!.id;

  const service = createServiceRoleClient();
  const { data: adminView } = await service.auth.admin.getUserById(profileId);
  for (const factor of adminView?.user?.factors ?? []) {
    await service.auth.admin.mfa.deleteFactor({ id: factor.id, userId: profileId });
  }

  await elevateToAal2(client);
  staffElevated.add(profileId);
  return client;
}

/**
 * Creates someone with a verified email and no memberships at all -- the
 * pre-Family user this whole file is about -- then signs in as them for real.
 *
 * Deliberately NOT helpers.ts's signUpNewUser(). That helper calls signUp and
 * relies on the local Auth container running with confirmations off, so it
 * returns a session. Whether that is true depends on which worktree last
 * started the shared stack: Stream A needs confirmations ON to review the
 * sign-in flows, and the moment their config owns the container, signUp comes
 * back with no session and every test that used it fails for reasons that have
 * nothing to do with the code under test (CLAUDE.md, 2026-08-30).
 *
 * Creating the user through the admin API with email_confirm sidesteps that
 * entirely: it behaves identically whichever config is loaded. The sign-in
 * itself still goes through the normal password flow, so the session and its
 * JWT are exactly what a real member would hold -- this shortcut is about
 * account setup, never about the access being tested.
 *
 * The sign-in carries TEST_CAPTCHA because [auth.captcha] is now enabled in
 * local and CI (S2, merged from main). There is no widget here to produce a
 * token, and GoTrue guards password sign-in, so without it every case in this
 * file fails with `captcha protection: request disallowed`. admin.createUser
 * above needs none -- the admin API is not guarded.
 */
async function signUpWithNoFamily() {
  const email = `h1-nofamily-${Date.now()}-${Math.random().toString(36).slice(2)}@f4milia.test`;
  const password = "password123";

  const service = createServiceRoleClient();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`admin.createUser failed for ${email}: ${createError?.message}`);
  }

  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
    options: TEST_CAPTCHA,
  });
  if (signInError) throw new Error(`sign-in failed for ${email}: ${signInError.message}`);

  return { client, profileId: created.user.id };
}

describe("support_requests -- the pre-Family path (H1 named edge case)", () => {
  it("a user who belongs to no Family can submit a request", async () => {
    const { client, profileId } = await signUpWithNoFamily();

    const { error } = await client.from("support_requests").insert({
      submitted_by_profile_id: profileId,
      org_id: null,
      subject: "How do I join a Family?",
      body: "I signed up and there is nothing here yet.",
    });

    // If this ever starts failing with a policy violation, someone has added
    // a membership test to the insert policy. That is the regression this
    // whole file exists for.
    expect(error).toBeNull();
  });

  it("and can read their own request back", async () => {
    const { client, profileId } = await signUpWithNoFamily();
    await client.from("support_requests").insert({
      submitted_by_profile_id: profileId,
      org_id: null,
      subject: "Cannot sign in on my phone",
      body: "The link in the email opens a blank page.",
    });

    const { data } = await client
      .from("support_requests")
      .select("subject, status, org_id")
      .eq("submitted_by_profile_id", profileId);

    expect(data).toHaveLength(1);
    expect(data![0].status).toBe("open");
    expect(data![0].org_id).toBeNull();
  });

  it("a request writes an audit row -- H1's stated acceptance criterion", async () => {
    const { client, profileId } = await signUpWithNoFamily();
    const { data: created } = await client
      .from("support_requests")
      .insert({
        submitted_by_profile_id: profileId,
        org_id: null,
        subject: "Billing question",
        body: "Am I being charged for this?",
      })
      .select("id")
      .single();

    // Read the audit row as staff, since audit_log is not readable by the
    // submitter -- which is itself the correct arrangement.
    const erin = await signInAsStaffWithMfa(SEEDED_USERS.erin);

    const { data: rows } = await erin
      .from("audit_log")
      .select("action, org_id, target_id, metadata")
      .eq("target_type", "support_requests")
      .eq("target_id", created!.id);

    expect(rows).toHaveLength(1);
    expect(rows![0].action).toBe("support_requests.insert");
    // A request from nobody's Family records a null Family rather than
    // attaching itself to one it has no business naming.
    expect(rows![0].org_id).toBeNull();
    // Column names only, never the member's words.
    expect(JSON.stringify(rows![0].metadata ?? {})).not.toContain("charged");
  });
});

describe("support_requests -- who can read what", () => {
  it("one member cannot read another member's request", async () => {
    const { client: author, profileId } = await signUpWithNoFamily();
    await author.from("support_requests").insert({
      submitted_by_profile_id: profileId,
      org_id: null,
      subject: "Private matter",
      body: "Something I would not want other members reading.",
    });

    const { client: stranger } = await signUpWithNoFamily();
    const { data } = await stranger.from("support_requests").select("id");

    expect(data ?? []).toHaveLength(0);
  });

  it("an organizer of the submitter's own Family cannot read it either", async () => {
    // The deliberate departure from every other table in this repo. A member
    // may be writing to the platform *about* their organizer; if the organizer
    // can read it, the channel is worthless in the case that matters most.
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: aliceUser } = await alice.auth.getUser();

    const { error } = await alice.from("support_requests").insert({
      submitted_by_profile_id: aliceUser.user!.id,
      org_id: FAMILY_A,
      subject: "Concern about how our Family is run",
      body: "I would rather the organizer did not see this.",
    });
    expect(error).toBeNull();

    const bob = await signInAs(SEEDED_USERS.bob); // organizer of Caregiver Circle
    const { data: asOrganizer } = await bob
      .from("support_requests")
      .select("id")
      .eq("submitted_by_profile_id", aliceUser.user!.id);

    expect(asOrganizer ?? []).toHaveLength(0);
  });

  it("a request cannot be tagged with a Family the submitter does not belong to", async () => {
    // org_id comes from a form field, so it is a client claim. A null Family is
    // always allowed -- that is the pre-Family path this file opens with -- but
    // naming somebody else's Family is not. Without this, anyone could bury a
    // Family in requests addressed to staff and make triage lie about where
    // problems are coming from.
    const { client, profileId } = await signUpWithNoFamily();

    const { error } = await client.from("support_requests").insert({
      submitted_by_profile_id: profileId,
      org_id: FAMILY_A,
      subject: "Filed against a Family I am not in",
      body: "I have no membership anywhere, yet I named Caregiver Circle.",
    });

    expect(error).not.toBeNull();
  });

  it("but a member CAN tag a request with their own Family", async () => {
    // The other half of the same clause -- proving the fix did not close the
    // ordinary case along with the abuse.
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: aliceUser } = await alice.auth.getUser();

    const { error } = await alice.from("support_requests").insert({
      submitted_by_profile_id: aliceUser.user!.id,
      org_id: FAMILY_A,
      subject: "Something about my own Family",
      body: "Alice is a member of Caregiver Circle, so this is allowed.",
    });

    expect(error).toBeNull();
  });

  it("a member cannot submit a request in someone else's name", async () => {
    const { client } = await signUpWithNoFamily();
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: aliceUser } = await alice.auth.getUser();

    const { error } = await client.from("support_requests").insert({
      submitted_by_profile_id: aliceUser.user!.id,
      org_id: null,
      subject: "Not mine",
      body: "Submitted under somebody else's identity.",
    });

    expect(error).not.toBeNull();
  });
});

describe("support_requests -- the staff view", () => {
  it("platform staff without MFA see nothing; with MFA they see every request", async () => {
    const { client, profileId } = await signUpWithNoFamily();
    await client.from("support_requests").insert({
      submitted_by_profile_id: profileId,
      org_id: null,
      subject: "Needs staff attention",
      body: "Routing this to the platform team.",
    });

    // is_platform_admin() requires aal2, so a staff account that has signed in
    // but not completed its second factor is still just a user here. Invariant
    // 7 makes 2FA mandatory for platform_staff; this asserts the database
    // agrees rather than trusting the sign-in screen to enforce it.
    const erinBefore = await signInAs(SEEDED_USERS.erin);
    const { data: beforeMfa } = await erinBefore.from("support_requests").select("id");
    expect(beforeMfa ?? []).toHaveLength(0);

    const erin = await signInAsStaffWithMfa(SEEDED_USERS.erin);
    const { data: afterMfa } = await erin.from("support_requests").select("id");
    expect((afterMfa ?? []).length).toBeGreaterThan(0);
  });

  it("staff can mark a request handled; the submitter cannot", async () => {
    const { client, profileId } = await signUpWithNoFamily();
    const { data: created } = await client
      .from("support_requests")
      .insert({
        submitted_by_profile_id: profileId,
        org_id: null,
        subject: "Please close this",
        body: "Resolved itself.",
      })
      .select("id")
      .single();

    // The submitter cannot change their own request after sending it -- staff
    // may already have acted on it.
    //
    // Asserted by re-reading the row, NOT by expecting an error. RLS filters an
    // UPDATE to the rows the USING clause admits, and an update that matches
    // zero rows is not an error -- PostgREST returns success having changed
    // nothing. Asserting on the error here passed while proving nothing, which
    // is the failure mode a security test can least afford.
    await client.from("support_requests").update({ status: "handled" }).eq("id", created!.id);

    const { data: stillOpen } = await client
      .from("support_requests")
      .select("status")
      .eq("id", created!.id)
      .single();
    expect(stillOpen!.status).toBe("open");

    const frank = await signInAsStaffWithMfa(SEEDED_USERS.frank);
    const { error: byStaff } = await frank
      .from("support_requests")
      .update({ status: "handled" })
      .eq("id", created!.id);
    expect(byStaff).toBeNull();

    const { data: after } = await frank
      .from("support_requests")
      .select("status")
      .eq("id", created!.id)
      .single();
    expect(after!.status).toBe("handled");
  });

  it("the staff view's joined shape resolves under RLS", async () => {
    // The inbox reads support_requests with organizations(name) and
    // profiles(display_name) embedded. Embedded joins are evaluated under the
    // caller's own policies, and this repo has already been bitten once by
    // assuming a role could read through a join it had no grant for
    // (CLAUDE.md, 2026-08-29). So the shape the page actually asks for is
    // exercised here rather than trusted.
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: aliceUser } = await alice.auth.getUser();
    await alice.from("support_requests").insert({
      submitted_by_profile_id: aliceUser.user!.id,
      org_id: FAMILY_A,
      subject: "Joined shape probe",
      body: "Filed against a real Family so both joins have something to find.",
    });

    const erin = await signInAsStaffWithMfa(SEEDED_USERS.erin);
    const { data, error } = await erin
      .from("support_requests")
      .select("id, subject, status, org_id, organizations(name), profiles(display_name)")
      .eq("submitted_by_profile_id", aliceUser.user!.id)
      .not("org_id", "is", null)
      .limit(1);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data![0].organizations?.name).toBeTruthy();
    expect(data![0].profiles?.display_name).toBeTruthy();
  });

  it("a staff read of the whole queue is itself recorded", async () => {
    // Postgres has no hook to log a SELECT, so lib/audit.ts makes the log write
    // a required step in the calling code. The staff inbox is its first caller;
    // this asserts the mechanism works for a platform_admin reading across
    // every Family, which is the case it exists for.
    const erin = await signInAsStaffWithMfa(SEEDED_USERS.erin);
    const { data: erinUser } = await erin.auth.getUser();

    const returned = await withAdminAudit(
      erin,
      "support_requests.staff_list",
      { type: "support_requests" },
      async () => {
        const { data } = await erin.from("support_requests").select("id").limit(5);
        return data ?? [];
      },
    );

    expect(Array.isArray(returned)).toBe(true);

    const { data: logged } = await erin
      .from("audit_log")
      .select("action, actor_profile_id, org_id")
      .eq("action", "support_requests.staff_list")
      .eq("actor_profile_id", erinUser.user!.id);

    expect((logged ?? []).length).toBeGreaterThan(0);
    // No single Family owns a cross-Family read.
    expect(logged![0].org_id).toBeNull();
  });

  it("nobody can delete a request, staff included", async () => {
    const { client, profileId } = await signUpWithNoFamily();
    const { data: created } = await client
      .from("support_requests")
      .insert({
        submitted_by_profile_id: profileId,
        org_id: null,
        subject: "Delete attempt",
        body: "Testing that this cannot be removed.",
      })
      .select("id")
      .single();

    const frank = await signInAsStaffWithMfa(SEEDED_USERS.frank);
    await frank.from("support_requests").delete().eq("id", created!.id);

    // No DELETE grant exists, so the statement is refused at the grant layer
    // and the row survives. Asserted by re-reading rather than by the error,
    // because what matters is that the record is still there.
    const { data: still } = await frank
      .from("support_requests")
      .select("id")
      .eq("id", created!.id);
    expect(still).toHaveLength(1);
  });
});
