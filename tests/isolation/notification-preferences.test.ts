import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, createServiceRoleClient, signInAs, signUpNewUser } from "./helpers";

// Alice is the canonical dual-Family fixture CLAUDE.md's testing rules name: a
// member of Caregiver Circle and a mentor in Founder Collective
// (supabase/seed.sql). The per-Family claim is asserted through her because a
// bug that collapses preferences into one global mute -- the exact thing
// invariant 3 forbids -- is only visible on someone in two Families at once.
const FAMILY_A = ORG_IDS.caregiverCircle;
const FAMILY_B = ORG_IDS.founderCollective;
const FAMILY_SHE_IS_NOT_IN = ORG_IDS.wellnessGuild;

const ALICE_ID = "00000000-0000-0000-0000-0000000000a1";

// Every isolation file shares one database within a single `db reset`, and the
// unique key here is (org_id, profile_id, type, channel). Tests that reuse a
// seeded user therefore claim a notification_type of their own AND clear that
// tuple before writing it, so the file is green on a database that already
// holds its rows -- Q4's "run the suite twice consecutively" requirement, and
// the order-dependence this repo has already paid for once (CLAUDE.md,
// 2026-08-29). Deleting your own row is a real member action here, not a
// test-only escape hatch: it is how "back to default" is expressed.
const TYPE_FOR_PER_FAMILY_TEST = "family_night_digest" as const;
const TYPE_FOR_ORGANIZER_TEST = "vow_notification" as const;

async function clearOwn(
  client: Awaited<ReturnType<typeof signInAs>>,
  profileId: string,
  notificationType: "family_night_digest" | "vow_notification",
) {
  await client
    .from("notification_preferences")
    .delete()
    .eq("profile_id", profileId)
    .eq("notification_type", notificationType);
}

describe("notification_preferences RLS (E1)", () => {
  it("a mute in one Family leaves the other alone -- invariant 3, per-Family and never one global mute", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    await clearOwn(alice, ALICE_ID, TYPE_FOR_PER_FAMILY_TEST);

    const { error: muteError } = await alice.from("notification_preferences").insert({
      org_id: FAMILY_A,
      profile_id: ALICE_ID,
      notification_type: TYPE_FOR_PER_FAMILY_TEST,
      channel: "email",
      enabled: false,
    });
    expect(muteError).toBeNull();

    const { data: rows } = await alice
      .from("notification_preferences")
      .select("org_id, enabled")
      .eq("profile_id", ALICE_ID)
      .eq("notification_type", TYPE_FOR_PER_FAMILY_TEST);

    // Exactly one row, in Family A. Nothing exists for Family B: absence is
    // the default and the default is subscribed, so muting A cannot have
    // quietly muted B as well.
    expect(rows).toHaveLength(1);
    expect(rows![0].org_id).toBe(FAMILY_A);
    expect(rows![0].enabled).toBe(false);
  });

  it("a member cannot hold a preference in a Family they do not belong to", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);

    const { error } = await alice.from("notification_preferences").insert({
      org_id: FAMILY_SHE_IS_NOT_IN,
      profile_id: ALICE_ID,
      notification_type: TYPE_FOR_PER_FAMILY_TEST,
      channel: "email",
      enabled: false,
    });

    // is_org_member() on the insert policy. Without it, someone could seed
    // rows for a Family they are about to join and pre-empt the fresh defaults
    // the removal trigger exists to guarantee.
    expect(error).not.toBeNull();
  });

  it("a member cannot write a preference on someone else's behalf", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: bobUser } = await bob.auth.getUser();

    const { error } = await alice.from("notification_preferences").insert({
      org_id: FAMILY_A,
      profile_id: bobUser.user!.id,
      notification_type: TYPE_FOR_PER_FAMILY_TEST,
      channel: "email",
      enabled: false,
    });

    expect(error).not.toBeNull();
  });

  it("an organizer of the member's own Family cannot read their mute", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    await clearOwn(alice, ALICE_ID, TYPE_FOR_ORGANIZER_TEST);

    const { error } = await alice.from("notification_preferences").insert({
      org_id: FAMILY_A,
      profile_id: ALICE_ID,
      notification_type: TYPE_FOR_ORGANIZER_TEST,
      channel: "email",
      enabled: false,
    });
    expect(error).toBeNull();

    // Bob is organizer of Caregiver Circle -- Alice's own Family. products,
    // reports and cohorts all extend read access to org staff; this table
    // deliberately does not. An organizer who can see who muted the digest can
    // act on it, and nothing in E1, N1 or 17.1's settings UI needs them to.
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: asOrganizer } = await bob
      .from("notification_preferences")
      .select("id")
      .eq("profile_id", ALICE_ID);

    expect(asOrganizer ?? []).toHaveLength(0);
  });

  it("a member of another Family sees none of it at all", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    await alice
      .from("notification_preferences")
      .delete()
      .eq("profile_id", ALICE_ID)
      .eq("org_id", FAMILY_B)
      .eq("notification_type", TYPE_FOR_ORGANIZER_TEST);
    await alice.from("notification_preferences").insert({
      org_id: FAMILY_B,
      profile_id: ALICE_ID,
      notification_type: TYPE_FOR_ORGANIZER_TEST,
      channel: "email",
      enabled: false,
    });

    // Dave is in Wellness Guild only. Unscoped select, so this catches a
    // policy that leaks rows without an org filter as well as one that leaks
    // across Families.
    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: asOutsider } = await dave.from("notification_preferences").select("id");

    expect(asOutsider ?? []).toHaveLength(0);
  });

  it("clearing a row returns that one type to the default and leaves the rest", async () => {
    const person = await signUpNewUser(`np-clear-${Date.now()}@f4milia.test`);
    const { data: personUser } = await person.auth.getUser();
    const profileId = personUser.user!.id;

    const service = createServiceRoleClient();
    const { error: joinError } = await service
      .from("memberships")
      .insert({ org_id: FAMILY_A, profile_id: profileId, role: "member" });
    expect(joinError).toBeNull();

    await person.from("notification_preferences").insert([
      { org_id: FAMILY_A, profile_id: profileId, notification_type: "family_night_digest", channel: "email", enabled: false },
      { org_id: FAMILY_A, profile_id: profileId, notification_type: "vow_notification", channel: "email", enabled: false },
    ]);

    // Deleting the row is how a member says "back to default" -- there is no
    // tri-state to set, which is the point of absence-is-default.
    const { error: deleteError } = await person
      .from("notification_preferences")
      .delete()
      .eq("profile_id", profileId)
      .eq("notification_type", "family_night_digest");
    expect(deleteError).toBeNull();

    const { data: left } = await person
      .from("notification_preferences")
      .select("notification_type")
      .eq("profile_id", profileId);

    expect((left ?? []).map((r) => r.notification_type)).toEqual(["vow_notification"]);
  });
});

// E1's named edge case for the 09:30 review, automated:
//   "Remove a member from a Family, re-invite later -- old mute rows don't
//    silently apply; defaults are fresh."
//
// Driven through the real membership lifecycle rather than by deleting
// preference rows, because what is being tested is precisely that nobody has
// to remember to delete them.
describe("preferences do not outlive a membership (E1 named edge case)", () => {
  it("removal clears that Family's preferences only, and re-joining starts fresh", async () => {
    const service = createServiceRoleClient();
    const person = await signUpNewUser(`np-rejoin-${Date.now()}@f4milia.test`);
    const { data: personUser } = await person.auth.getUser();
    const profileId = personUser.user!.id;

    // In both Families, so the test can show the clear is scoped to one of
    // them rather than wiping the member's settings everywhere.
    const { error: joinError } = await service.from("memberships").insert([
      { org_id: FAMILY_A, profile_id: profileId, role: "member" },
      { org_id: FAMILY_B, profile_id: profileId, role: "member" },
    ]);
    expect(joinError).toBeNull();

    const { error: setError } = await person.from("notification_preferences").insert([
      { org_id: FAMILY_A, profile_id: profileId, notification_type: "family_night_digest", channel: "email", enabled: false },
      { org_id: FAMILY_B, profile_id: profileId, notification_type: "family_night_digest", channel: "email", enabled: false },
    ]);
    expect(setError).toBeNull();

    // Soft delete: the shape every membership path in this repo uses.
    const { error: removeError } = await service
      .from("memberships")
      .update({ deleted_at: new Date().toISOString() })
      .eq("org_id", FAMILY_A)
      .eq("profile_id", profileId);
    expect(removeError).toBeNull();

    const { data: afterRemoval } = await person
      .from("notification_preferences")
      .select("org_id")
      .eq("profile_id", profileId);

    expect((afterRemoval ?? []).map((r) => r.org_id)).toEqual([FAMILY_B]);

    // Re-invite. accept_invitation() re-uses the existing membership row
    // (on conflict (org_id, profile_id) do update set ... deleted_at = null),
    // which is exactly why a preference keyed on that pair would otherwise
    // come back to life months later for someone who never chose it.
    const { error: rejoinError } = await service
      .from("memberships")
      .update({ deleted_at: null })
      .eq("org_id", FAMILY_A)
      .eq("profile_id", profileId);
    expect(rejoinError).toBeNull();

    const { data: afterRejoin } = await person
      .from("notification_preferences")
      .select("org_id")
      .eq("profile_id", profileId)
      .eq("org_id", FAMILY_A);

    expect(afterRejoin ?? []).toHaveLength(0);
  });
});
