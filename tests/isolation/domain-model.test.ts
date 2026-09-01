import { describe, expect, it } from "vitest";
import {
  ORG_IDS,
  SEEDED_USERS,
  createServiceRoleClient,
  currentAal,
  elevateToAal2,
  signInAs,
} from "./helpers";

/**
 * Schema PR 9 -- the gate the whole domain-model stack has been waiting on.
 *
 * WHAT THIS FILE IS FOR. pgTAP connects as `postgres` and BYPASSES RLS
 * entirely, so nothing in supabase/tests/database/** proves that a single
 * policy on towers, builds, bricks, table_entries, table_prompts, mood_tags or
 * vows actually works. Those files assert the policies EXIST with the shape
 * they claim. This file is the only thing that asserts they DO anything.
 *
 * Every client here is a real user signing in with their own JWT. The service
 * role appears exactly twice, both times to establish a precondition a real
 * user cannot (a block row, a memorial lock) -- never to read or write the
 * thing under test.
 *
 * Alice is the canonical dual-Family fixture: a `member` of caregiver-circle
 * and a `mentor` of founder-collective. D1's named edge case is hers --
 * "Tower, streak, Vow holder all switch with zero bleed" -- and the seed
 * deliberately gives the two Families DIFFERENT values so that claim can fail.
 *
 * Assertions are by PROPERTY, not by list length, wherever a sibling test
 * could add a row: C1 PR5's lesson is that `toHaveLength(1)` on a shared
 * collection asserts a starting state and goes red the moment somebody else
 * writes. The counts that ARE pinned come from supabase/seed.sql and are
 * guarded by supabase/tests/database/180_seed_domain_data.sql.
 */


/**
 * ONE SIGN-IN PER USER FOR THE WHOLE FILE, memoised.
 *
 * S2's auth rate limiter is five attempts per fifteen minutes per account, and
 * this suite already performs ~159 sign-ins across its other files. Signing in
 * per test added 22 more against the same four seeded accounts and pushed
 * later files over the edge -- the symptom was not a rate-limit error in THIS
 * file but two unrelated specs failing downstream, which is the worst possible
 * shape for a shared-resource bug. A JWT is valid for the whole run, so there
 * is no reason to re-authenticate per test.
 */
const clients = new Map<string, Promise<Awaited<ReturnType<typeof signInAs>>>>();
function as(user: { email: string; password: string }) {
  const existing = clients.get(user.email);
  if (existing) return existing;
  const created = signInAs(user);
  clients.set(user.email, created);
  return created;
}

const CAREGIVER_TOWER = "Bring Mum home";
const FOUNDER_TOWER = "Ship the pilot to ten families";

/**
 * The CALLER'S OWN membership in one Family.
 *
 * Filtering only by org_id and calling .maybeSingle() does not work, and the
 * way it fails is quiet: RLS lets a member read every membership row in their
 * own Family, so `eq(org_id).maybeSingle()` matches two rows and PostgREST
 * answers with no row rather than an error you would notice. Every assertion
 * downstream then reads `undefined` and reports "expected undefined to be
 * truthy", which looks like missing seed data rather than a bad query.
 *
 * So the profile id comes from the session, not from a guess.
 */
async function ownMembership(client: Awaited<ReturnType<typeof signInAs>>, orgId: string) {
  const {
    data: { user },
  } = await client.auth.getUser();
  const { data } = await client
    .from("memberships")
    .select("id, role, profile_id")
    .eq("org_id", orgId)
    .eq("profile_id", user!.id)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

describe("domain model isolation -- towers, builds, bricks", () => {
  it("a member reads their own Family's Tower and no other", async () => {
    const bob = await as(SEEDED_USERS.bob); // caregiver-circle only

    // POSITIVE FIRST. A file that only asserts refusals passes with the SELECT
    // policy deleted entirely -- no policy means no permission means every
    // "cannot read" assertion goes green for the worst possible reason
    // (CLAUDE.md, C1 PR2).
    const { data: own } = await bob.from("towers").select("title").eq("org_id", ORG_IDS.caregiverCircle);
    expect((own ?? []).map((t) => t.title)).toContain(CAREGIVER_TOWER);

    const { data: other } = await bob.from("towers").select("title").eq("org_id", ORG_IDS.founderCollective);
    expect(other ?? []).toEqual([]);
  });

  it("a member of a third Family sees no Towers at all", async () => {
    const dave = await as(SEEDED_USERS.dave); // wellness-guild, seeded empty

    const { data } = await dave.from("towers").select("id, org_id");
    expect(data ?? []).toEqual([]);
  });

  it("builds and bricks are scoped the same way", async () => {
    const bob = await as(SEEDED_USERS.bob);
    const dave = await as(SEEDED_USERS.dave);

    const { data: bobBuilds } = await bob.from("builds").select("org_id");
    expect((bobBuilds ?? []).length).toBeGreaterThan(0);
    expect((bobBuilds ?? []).every((b) => b.org_id === ORG_IDS.caregiverCircle)).toBe(true);

    const { data: bobBricks } = await bob.from("bricks").select("org_id");
    expect((bobBricks ?? []).length).toBeGreaterThan(0);
    expect((bobBricks ?? []).every((b) => b.org_id === ORG_IDS.caregiverCircle)).toBe(true);

    const { data: daveBuilds } = await dave.from("builds").select("id");
    const { data: daveBricks } = await dave.from("bricks").select("id");
    expect(daveBuilds ?? []).toEqual([]);
    expect(daveBricks ?? []).toEqual([]);
  });

  it("a member cannot claim a Brick in a Family they are not in", async () => {
    const dave = await as(SEEDED_USERS.dave);

    // Dave's own membership id -- he has one, in wellness-guild.
    const daveMembership = await ownMembership(dave, ORG_IDS.wellnessGuild);
    expect(daveMembership?.id).toBeTruthy();

    // A caregiver-circle Brick, named by an id he should not be able to touch.
    const { data, error } = await dave
      .from("bricks")
      .update({ assignee: daveMembership!.id })
      .eq("org_id", ORG_IDS.caregiverCircle)
      .select();

    // RLS makes the rows invisible rather than raising: the UPDATE matches
    // nothing. Either shape is a refusal; what must not happen is a row coming
    // back changed.
    expect(error?.code ?? null).not.toBe("00000");
    expect(data ?? []).toEqual([]);
  });
});

describe("D1's named edge case -- the dual-Family switch, at the data layer", () => {
  it("Alice sees a different Tower in each of her two Families, and nothing from the third", async () => {
    const alice = await as(SEEDED_USERS.alice);

    const { data: caregiver } = await alice
      .from("towers")
      .select("title")
      .eq("org_id", ORG_IDS.caregiverCircle);
    const { data: founder } = await alice
      .from("towers")
      .select("title")
      .eq("org_id", ORG_IDS.founderCollective);

    expect((caregiver ?? []).map((t) => t.title)).toContain(CAREGIVER_TOWER);
    expect((founder ?? []).map((t) => t.title)).toContain(FOUNDER_TOWER);

    // The point of the edge case: the two answers differ. Identical seed data
    // would pass every assertion above while proving nothing.
    expect(CAREGIVER_TOWER).not.toBe(FOUNDER_TOWER);

    const { data: third } = await alice.from("towers").select("id").eq("org_id", ORG_IDS.wellnessGuild);
    expect(third ?? []).toEqual([]);
  });

  it("her streak switches with the Family, and a non-member gets nothing", async () => {
    const alice = await as(SEEDED_USERS.alice);

    const { data: caregiverStreak } = await alice.rpc("family_streak", { p_org_id: ORG_IDS.caregiverCircle });
    const { data: founderStreak } = await alice.rpc("family_streak", { p_org_id: ORG_IDS.founderCollective });

    expect(caregiverStreak).toBe(6);
    expect(founderStreak).toBe(3);
    expect(caregiverStreak).not.toBe(founderStreak);

    // THE AGGREGATE LEAK CHECK, and the reason family_streak is SECURITY
    // INVOKER. As a definer it would answer for any org_id a caller guessed,
    // reporting how active another Family is -- a number leaking what the rows
    // behind it do not, which is C1 PR4's unread-count defect exactly.
    const dave = await as(SEEDED_USERS.dave);
    const { data: leaked } = await dave.rpc("family_streak", { p_org_id: ORG_IDS.caregiverCircle });
    expect(leaked).toBe(0);
  });

  it("the Vow holder switches with the Family, and differs between them", async () => {
    const alice = await as(SEEDED_USERS.alice);

    const { data: caregiverVow } = await alice
      .from("vows")
      .select("holder_id, commitment")
      .eq("org_id", ORG_IDS.caregiverCircle)
      .neq("status", "complete")
      .maybeSingle();
    const { data: founderVow } = await alice
      .from("vows")
      .select("holder_id, commitment")
      .eq("org_id", ORG_IDS.founderCollective)
      .neq("status", "complete")
      .maybeSingle();

    expect(caregiverVow?.holder_id).toBeTruthy();
    expect(founderVow?.holder_id).toBeTruthy();
    expect(caregiverVow!.holder_id).not.toBe(founderVow!.holder_id);

    const dave = await as(SEEDED_USERS.dave);
    const { data: daveVows } = await dave.from("vows").select("id");
    expect(daveVows ?? []).toEqual([]);
  });

  it("next_vow_holder answers only for a Family the caller is in", async () => {
    const alice = await as(SEEDED_USERS.alice);
    const dave = await as(SEEDED_USERS.dave);

    const { data: mine } = await alice.rpc("next_vow_holder", { p_org_id: ORG_IDS.caregiverCircle });
    expect(mine).toBeTruthy();

    const { data: theirs } = await dave.rpc("next_vow_holder", { p_org_id: ORG_IDS.caregiverCircle });
    expect(theirs).toBeNull();
  });
});

describe("the Table -- entries, prompts, and who may write them", () => {
  it("a member reads their Family's entries and writes only their own", async () => {
    const bob = await as(SEEDED_USERS.bob);

    const { data: readable } = await bob.from("table_entries").select("org_id");
    expect((readable ?? []).length).toBeGreaterThan(0);
    expect((readable ?? []).every((e) => e.org_id === ORG_IDS.caregiverCircle)).toBe(true);

    const bobMembership = await ownMembership(bob, ORG_IDS.caregiverCircle);

    // A date far enough back that the one-per-member-per-day index cannot
    // collide with the seed.
    const day = "2020-01-01";

    // CLEAN UP BEFORE AND AFTER, and note WHY the cleanup is an UPDATE.
    // table_entries has no DELETE policy and no DELETE grant by design -- an
    // entry is soft-deleted so it survives for the Ledger, the Keepsake and
    // the memorial lock. A `.delete()` here matches nothing and silently
    // leaves the row, which on the next run cost two failures at once: the
    // insert below hit 23505, and family_streak read 7 instead of 6 because a
    // leftover entry is a distinct day the Family "showed up".
    // Returns what it actually changed, and callers assert on it. A cleanup
    // that fails quietly is the whole reason this needed two attempts.
    // Retiring goes through retire_table_entry(), NOT through a direct UPDATE
    // of deleted_at. This test is what found out why: the SELECT policy is
    // `using (deleted_at is null and ...)`, so on UPDATE the new row fails its
    // own policy the moment deleted_at stops being null, and Postgres refuses
    // with 42501. Measured on the same row, same author, same session --
    // updating response_text succeeded and updating deleted_at did not.
    // 20260903101311 has the full account.
    const clearProbeDay = async () => {
      const { data: mine } = await bob
        .from("table_entries")
        .select("id")
        .eq("member_id", bobMembership!.id)
        .eq("entry_date", day);
      let retired = 0;
      for (const row of mine ?? []) {
        const { data: ok, error } = await bob.rpc("retire_table_entry", { p_entry_id: row.id });
        expect(error).toBeNull();
        if (ok) retired += 1;
      }
      return retired;
    };

    await clearProbeDay();

    const { error: ownWrite } = await bob.from("table_entries").insert({
      org_id: ORG_IDS.caregiverCircle,
      member_id: bobMembership!.id,
      entry_date: day,
      response_text: "written by the person it is attributed to",
    });
    expect(ownWrite).toBeNull();

    // Attributing an entry to somebody else is refused by the INSERT policy,
    // which checks member_id against memberships rather than trusting the
    // client's claim.
    const { data: aliceMembershipRows } = await bob
      .from("memberships")
      .select("id, profile_id")
      .eq("org_id", ORG_IDS.caregiverCircle);
    const notBob = (aliceMembershipRows ?? []).find((m) => m.id !== bobMembership!.id);
    expect(notBob).toBeTruthy();

    const { error: forgery } = await bob.from("table_entries").insert({
      org_id: ORG_IDS.caregiverCircle,
      member_id: notBob!.id,
      entry_date: "2020-01-02",
      response_text: "put in somebody else's mouth",
    });
    expect(forgery).not.toBeNull();

    // A direct UPDATE of deleted_at is refused, and that refusal is asserted
    // rather than worked around silently -- it is the reason
    // retire_table_entry() exists.
    const { data: probe } = await bob
      .from("table_entries")
      .select("id")
      .eq("member_id", bobMembership!.id)
      .eq("entry_date", day)
      .maybeSingle();
    const { error: directDelete } = await bob
      .from("table_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", probe!.id);
    expect(directDelete?.code).toBe("42501");

    // Leaves the Family's streak exactly as it found it -- asserted, because
    // the row this retires is a distinct day and would otherwise push
    // family_streak from 6 to 7 on the next run.
    expect(await clearProbeDay()).toBe(1);
  });

  it("a member cannot edit another member's entry", async () => {
    const bob = await as(SEEDED_USERS.bob);

    const bobMembership = await ownMembership(bob, ORG_IDS.caregiverCircle);

    const { data: someoneElses } = await bob
      .from("table_entries")
      .select("id")
      .neq("member_id", bobMembership!.id)
      .limit(1)
      .maybeSingle();
    expect(someoneElses?.id).toBeTruthy();

    const { data: changed } = await bob
      .from("table_entries")
      .update({ response_text: "rewritten by somebody else" })
      .eq("id", someoneElses!.id)
      .select();
    expect(changed ?? []).toEqual([]);
  });

  it("a platform-wide prompt is readable by everyone; a Family's own is not", async () => {
    const dave = await as(SEEDED_USERS.dave);

    const { data: prompts } = await dave.from("table_prompts").select("org_id");
    expect((prompts ?? []).length).toBeGreaterThan(0);
    // Dave is in no populated Family, so every prompt he can see must be a
    // platform one. A Family-authored prompt leaking here would be a Family's
    // own words reaching a stranger.
    expect((prompts ?? []).every((p) => p.org_id === null)).toBe(true);
  });

  it("mood_tags is empty, and stays readable rather than erroring", async () => {
    // 10.5 is unspecified, so the vocabulary is deliberately unseeded. The
    // dashboard has to render that without falling over.
    const alice = await as(SEEDED_USERS.alice);
    const { data, error } = await alice.from("mood_tags").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});

describe("invariant 6 -- a block hides content from the blocker, not from the room", () => {
  it("Alice stops seeing Bob's entries after blocking him; Bob still sees his own", async () => {
    const service = createServiceRoleClient();
    const alice = await as(SEEDED_USERS.alice);
    const bob = await as(SEEDED_USERS.bob);

    const { data: memberships } = await service
      .from("memberships")
      .select("id, profile_id")
      .eq("org_id", ORG_IDS.caregiverCircle);
    const aliceM = (memberships ?? []).find((m) => m.profile_id.endsWith("a1"));
    const bobM = (memberships ?? []).find((m) => m.profile_id.endsWith("a2"));
    expect(aliceM && bobM).toBeTruthy();

    const bobsEntryIds = async (client: typeof alice) => {
      const { data } = await client.from("table_entries").select("id, member_id").eq("member_id", bobM!.id);
      return (data ?? []).map((e) => e.id).sort();
    };

    // ESTABLISH THE PRECONDITION FIRST -- "Alice is not blocking Bob".
    //
    // This delete used to sit BELOW the baseline read, which made the file fail
    // on every second consecutive run: the block row from the previous run was
    // still there, so Alice already saw nothing and the "before" assertion
    // failed. The error reads as a broken SELECT policy on table_entries, three
    // steps from the cause. Measured -- reproducible on runs 2 and 3, green on
    // run 1.
    //
    // A spec asserts a TRANSITION. It cannot do that until it owns its own
    // starting point.
    await service.from("member_blocks").delete().eq("blocker_membership_id", aliceM!.id);

    const beforeForAlice = await bobsEntryIds(alice);
    const forBob = await bobsEntryIds(bob);
    // The positive half. Without it, everything below passes with the SELECT
    // policy deleted.
    expect(beforeForAlice.length).toBeGreaterThan(0);
    expect(forBob).toEqual(beforeForAlice);
    const { error: blockError } = await service.from("member_blocks").insert({
      org_id: ORG_IDS.caregiverCircle,
      blocker_membership_id: aliceM!.id,
      blocked_membership_id: bobM!.id,
    });
    expect(blockError).toBeNull();

    try {
      expect(await bobsEntryIds(alice)).toEqual([]);
      // Hidden from the BLOCKER specifically, not deleted for the room.
      expect(await bobsEntryIds(bob)).toEqual(forBob);
    } finally {
      await service.from("member_blocks").delete().eq("blocker_membership_id", aliceM!.id);
    }

    // And restored once the block is gone, so this file leaves no residue for
    // a re-run or for a sibling spec.
    expect(await bobsEntryIds(alice)).toEqual(beforeForAlice);
  });
});

describe("the mentor question -- settled: same dashboard, degrading naturally", () => {
  it("Alice-as-mentor reads founder-collective's Family-level data", async () => {
    const alice = await as(SEEDED_USERS.alice);

    const { data: tower } = await alice
      .from("towers")
      .select("title")
      .eq("org_id", ORG_IDS.founderCollective)
      .maybeSingle();
    expect(tower?.title).toBe(FOUNDER_TOWER);

    const { data: streak } = await alice.rpc("family_streak", { p_org_id: ORG_IDS.founderCollective });
    expect(streak).toBe(3);

    const { data: vow } = await alice
      .from("vows")
      .select("id")
      .eq("org_id", ORG_IDS.founderCollective)
      .neq("status", "complete")
      .maybeSingle();
    expect(vow?.id).toBeTruthy();

    const { data: ledger } = await alice
      .from("ledger_events")
      .select("id")
      .eq("org_id", ORG_IDS.founderCollective);
    expect((ledger ?? []).length).toBeGreaterThan(0);
  });

  it("and her PERSONAL sections there are honestly empty, not broken", async () => {
    const alice = await as(SEEDED_USERS.alice);

    const mentorMembership = await ownMembership(alice, ORG_IDS.founderCollective);
    expect(mentorMembership?.role).toBe("mentor");

    // Element 2: no Bricks of her own in this Family.
    const { data: herBricks } = await alice
      .from("bricks")
      .select("id")
      .eq("assignee", mentorMembership!.id);
    expect(herBricks ?? []).toEqual([]);

    // Element 4: today's status resolves, and says "not written" rather than
    // erroring or answering for somebody else.
    const { data: today, error } = await alice.rpc("family_table_day", {
      p_org_id: ORG_IDS.founderCollective,
    });
    expect(error).toBeNull();
    const row = Array.isArray(today) ? today[0] : today;
    expect(row?.written).toBe(false);
    expect(row?.family_date).toBeTruthy();
  });
});

describe("memorial lock -- invariant 8, at the row level", () => {
  it("a memorialised member's own entries become uneditable, and stay visible", async () => {
    const bob = await as(SEEDED_USERS.bob);
    const bobMembership = await ownMembership(bob, ORG_IDS.caregiverCircle);

    const { data: own } = await bob
      .from("table_entries")
      .select("id, response_text")
      .eq("member_id", bobMembership!.id)
      .limit(1)
      .maybeSingle();
    expect(own?.id).toBeTruthy();

    // Alive: he can edit his own words. The positive half again -- without it
    // the assertion below passes for any reason at all, including the lock
    // never having been applied. Which is exactly what happened on the first
    // run of this test; see the note on the staff path below.
    const { data: editedAlive } = await bob
      .from("table_entries")
      .update({ response_text: own!.response_text })
      .eq("id", own!.id)
      .select();
    expect((editedAlive ?? []).length).toBe(1);

    // THE REAL PRODUCT PATH, and it has to be. The first draft of this test
    // set profiles.memorialized_at with the service role, and it silently did
    // nothing: service_role has NEITHER SELECT NOR UPDATE on profiles
    // (measured -- has_table_privilege returns false for both). The lock was
    // never applied, the entry stayed editable, and the failure read as a
    // broken policy rather than a broken fixture. CLAUDE.md's 2026-09-01 entry
    // says it plainly: check the grant before writing the test.
    //
    // memorialize_profile() is SECURITY DEFINER and gated on
    // is_platform_admin(), which is is_platform_staff() AND aal2 -- so this
    // needs a staff account that has presented a second factor. Erin is
    // platform_staff in the seed.
    const erin = await as(SEEDED_USERS.erin);
    await elevateToAal2(erin);
    expect(await currentAal(erin)).toBe("aal2");

    const { data: locked, error: lockError } = await erin.rpc("memorialize_profile", {
      p_profile_id: bobMembership!.profile_id,
    });
    expect(lockError).toBeNull();
    expect(locked).toBe(true);

    try {
      const { data: editedLocked } = await bob
        .from("table_entries")
        .update({ response_text: "edited after the lock" })
        .eq("id", own!.id)
        .select();
      expect(editedLocked ?? []).toEqual([]);

      // F8.2: locked from EDITING, not from view. The Family keeps reading them.
      const { data: stillVisible } = await bob.from("table_entries").select("id").eq("id", own!.id);
      expect((stillVisible ?? []).map((e) => e.id)).toEqual([own!.id]);
    } finally {
      // Reversible by the same staff path, so this file leaves no residue for
      // a re-run or for a sibling spec. The MFA factor elevateToAal2 leaves on
      // Erin is pre-existing behaviour of this suite, noted in CLAUDE.md.
      await erin.rpc("unmemorialize_profile", { p_profile_id: bobMembership!.profile_id });

      // And the MFA factor goes too. GoTrue refuses BOTH enrol and unenrol
      // from an aal1 session once a verified factor exists, so a factor left
      // behind here cannot be cleared by the next run -- it can only be
      // reset away. That is what made this file unrunnable twice in a row:
      // "AAL2 required to enroll a new factor", from a session that was aal1
      // precisely because the leftover factor was blocking elevation.
      // Unenrolling while still at aal2 is the only window in which it is
      // possible.
      const { data: factors } = await erin.auth.mfa.listFactors();
      for (const factor of factors?.all ?? []) {
        await erin.auth.mfa.unenroll({ factorId: factor.id });
      }
    }

    const { data: editableAgain } = await bob
      .from("table_entries")
      .update({ response_text: own!.response_text })
      .eq("id", own!.id)
      .select();
    expect((editableAgain ?? []).length).toBe(1);
  });
});
