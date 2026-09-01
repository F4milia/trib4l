import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { filterByPreference, isNotificationEnabled, type Recipient } from "./preferences";

const FAMILY_A = "00000000-0000-0000-0000-00000000000a";
const FAMILY_B = "00000000-0000-0000-0000-00000000000b";

const OVERLAPPING_MEMBER: Recipient = { profileId: "profile-alice", email: "alice@f4milia.test" };
const OTHER_MEMBER: Recipient = { profileId: "profile-bob", email: "bob@f4milia.test" };

/**
 * In-memory stand-in for public.notification_preference_enabled(), mirroring
 * exactly the behaviour the sender depends on: a stored row wins, and the
 * absence of a row means subscribed. Rows are keyed the way the table's unique
 * constraint keys them, so a fake that ignored org_id could not pass the
 * per-Family test below.
 */
function fakePreferenceClient(
  rows: { orgId: string; profileId: string; type: string; enabled: boolean }[],
  failFor: string[] = [],
) {
  const client = {
    rpc(_fn: string, args: { p_org_id: string; p_profile_id: string; p_type: string }) {
      if (failFor.includes(args.p_profile_id)) {
        return Promise.resolve({ data: null, error: { message: "connection reset" } });
      }
      const row = rows.find(
        (r) => r.orgId === args.p_org_id && r.profileId === args.p_profile_id && r.type === args.p_type,
      );
      return Promise.resolve({ data: row ? row.enabled : true, error: null });
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

describe("isNotificationEnabled", () => {
  it("a member who has never touched a setting is subscribed", async () => {
    const client = fakePreferenceClient([]);
    await expect(
      isNotificationEnabled(client, {
        orgId: FAMILY_A,
        profileId: OVERLAPPING_MEMBER.profileId,
        type: "family_night_digest",
      }),
    ).resolves.toBe(true);
  });

  it("an explicit mute is honoured", async () => {
    const client = fakePreferenceClient([
      { orgId: FAMILY_A, profileId: OVERLAPPING_MEMBER.profileId, type: "family_night_digest", enabled: false },
    ]);
    await expect(
      isNotificationEnabled(client, {
        orgId: FAMILY_A,
        profileId: OVERLAPPING_MEMBER.profileId,
        type: "family_night_digest",
      }),
    ).resolves.toBe(false);
  });

  it("surfaces a read failure instead of assuming consent", async () => {
    const client = fakePreferenceClient([], [OVERLAPPING_MEMBER.profileId]);
    await expect(
      isNotificationEnabled(client, {
        orgId: FAMILY_A,
        profileId: OVERLAPPING_MEMBER.profileId,
        type: "family_night_digest",
      }),
    ).rejects.toThrow(/Could not read notification preference/);
  });
});

describe("filterByPreference", () => {
  // E1's acceptance criterion, exactly as written: "A member with Family A
  // muted and Family B unmuted receives exactly B's digest."
  const mutedInAOnly = fakePreferenceClient([
    { orgId: FAMILY_A, profileId: OVERLAPPING_MEMBER.profileId, type: "family_night_digest", enabled: false },
  ]);

  it("the member is skipped for Family A's digest", async () => {
    const result = await filterByPreference(
      mutedInAOnly,
      { orgId: FAMILY_A, type: "family_night_digest" },
      [OVERLAPPING_MEMBER],
    );

    expect(result.send).toEqual([]);
    expect(result.muted).toEqual([OVERLAPPING_MEMBER]);
  });

  it("the same member still receives Family B's digest -- per-Family, never one global mute", async () => {
    const result = await filterByPreference(
      mutedInAOnly,
      { orgId: FAMILY_B, type: "family_night_digest" },
      [OVERLAPPING_MEMBER],
    );

    expect(result.send).toEqual([OVERLAPPING_MEMBER]);
    expect(result.muted).toEqual([]);
  });

  it("muting the digest does not mute Vow notifications in the same Family", async () => {
    const result = await filterByPreference(
      mutedInAOnly,
      { orgId: FAMILY_A, type: "vow_notification" },
      [OVERLAPPING_MEMBER],
    );

    expect(result.send).toEqual([OVERLAPPING_MEMBER]);
  });

  it("one unreadable preference does not abandon everyone else's digest", async () => {
    // A digest to twelve people should not be lost because one read failed --
    // but the member whose preference could not be read is suppressed, not
    // sent to. A failed read is not evidence of consent.
    const client = fakePreferenceClient([], [OTHER_MEMBER.profileId]);
    const result = await filterByPreference(
      client,
      { orgId: FAMILY_A, type: "family_night_digest" },
      [OVERLAPPING_MEMBER, OTHER_MEMBER],
    );

    expect(result.send).toEqual([OVERLAPPING_MEMBER]);
    expect(result.unresolved.map((u) => u.recipient)).toEqual([OTHER_MEMBER]);
    expect(result.muted).toEqual([]);
  });
});
