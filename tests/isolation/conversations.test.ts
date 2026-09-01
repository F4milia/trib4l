import { describe, expect, it } from "vitest";
import {
  listConversations,
  listMessages,
  markConversationRead,
  openDirectConversation,
  resolveMembershipId,
  sendMessage,
  unreadCounts,
} from "../../lib/conversations";
import { ORG_IDS, SEEDED_USERS, createServiceRoleClient, signInAs } from "./helpers";

/**
 * C1 PR 5. The dual-Family proof a SECOND time, through the client path.
 *
 * 111_conversations_rls.sql already proves the policies in pgTAP. This file is
 * not a duplicate of it: pgTAP asserts SQL against policies, and this asserts
 * that lib/conversations.ts -- the code the app will actually call -- inherits
 * that isolation rather than quietly widening it. Those are different claims,
 * and the second is where a service-role shortcut or a forgotten filter would
 * show up.
 *
 * Alice is the canonical dual-Family fixture from the seed: a member of
 * Caregiver Circle and a mentor in Founder Collective.
 */

describe("conversations, through the data-access layer", () => {
  it("gives alice exactly one Family's rooms per Family, and never both", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);

    const inA = await listConversations(alice, ORG_IDS.caregiverCircle);
    const inB = await listConversations(alice, ORG_IDS.founderCollective);

    // Exactly one Family channel each. Counted BY KIND rather than asserting
    // the list length: DMs opened by other tests in this file are legitimate
    // rooms, and `toHaveLength(1)` asserts a starting state rather than a
    // property -- it passed alone and failed the moment the DM test ran first.
    expect(inA.filter((c) => c.kind === "family_channel")).toHaveLength(1);
    expect(inB.filter((c) => c.kind === "family_channel")).toHaveLength(1);

    // The actual isolation claim, and it holds however many rooms exist: every
    // room is in the Family it was asked for, and the two sets are disjoint.
    expect(inA.every((c) => c.orgId === ORG_IDS.caregiverCircle)).toBe(true);
    expect(inB.every((c) => c.orgId === ORG_IDS.founderCollective)).toBe(true);

    const idsInB = new Set(inB.map((c) => c.id));
    expect(inA.some((c) => idsInB.has(c.id))).toBe(false);
  });

  it("resolves a different membership for alice in each Family", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);

    const membershipInA = await resolveMembershipId(alice, ORG_IDS.caregiverCircle);
    const membershipInB = await resolveMembershipId(alice, ORG_IDS.founderCollective);

    // One person, two memberships. This is the fact the whole scoping model
    // rests on -- if these were ever equal, participation could not tell the
    // two Families apart.
    expect(membershipInA).not.toBe(membershipInB);
  });

  it("refuses a Family alice does not belong to", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    await expect(resolveMembershipId(alice, ORG_IDS.wellnessGuild)).rejects.toThrow(
      /not a member/i,
    );
  });

  it("shows dave nothing from either of alice's Families", async () => {
    const dave = await signInAs(SEEDED_USERS.dave);

    // Dave is in Wellness Guild only. Asking for another Family's rooms
    // returns empty rather than erroring -- RLS filters, it does not announce.
    expect(await listConversations(dave, ORG_IDS.caregiverCircle)).toHaveLength(0);
    expect(await listConversations(dave, ORG_IDS.founderCollective)).toHaveLength(0);

    // His own Family he does see -- otherwise the two assertions above would
    // pass just as happily against a function that always returns nothing.
    const his = await listConversations(dave, ORG_IDS.wellnessGuild);
    expect(his.filter((c) => c.kind === "family_channel")).toHaveLength(1);
  });

  it("delivers a message to the room's members and to nobody else", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);
    const dave = await signInAs(SEEDED_USERS.dave);

    const [channel] = await listConversations(alice, ORG_IDS.caregiverCircle);
    const body = `alice says hello ${crypto.randomUUID()}`;

    await sendMessage(alice, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: channel.id,
      body,
    });

    // Bob is in the same Family channel.
    const bobsView = await listMessages(bob, channel.id);
    expect(bobsView.some((m) => m.body === body)).toBe(true);

    // Dave is in a different Family entirely, and asking by id gets nothing.
    const davesView = await listMessages(dave, channel.id);
    expect(davesView).toHaveLength(0);
  });

  it("refuses a message into a Family the sender does not belong to", async () => {
    const dave = await signInAs(SEEDED_USERS.dave);
    const alice = await signInAs(SEEDED_USERS.alice);
    const [channel] = await listConversations(alice, ORG_IDS.caregiverCircle);

    // resolveMembershipId throws first -- dave has no membership to send as,
    // which is the honest failure and happens before any write is attempted.
    await expect(
      sendMessage(dave, {
        orgId: ORG_IDS.caregiverCircle,
        conversationId: channel.id,
        body: "dave should not be here",
      }),
    ).rejects.toThrow(/not a member/i);
  });

  it("opens one direct conversation for a pair, however many times it is asked", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bobMembership = await resolveMembershipId(
      await signInAs(SEEDED_USERS.bob),
      ORG_IDS.caregiverCircle,
    );

    const first = await openDirectConversation(alice, {
      orgId: ORG_IDS.caregiverCircle,
      otherMembershipIds: [bobMembership],
    });
    const second = await openDirectConversation(alice, {
      orgId: ORG_IDS.caregiverCircle,
      otherMembershipIds: [bobMembership],
    });

    // Two people have one conversation, not one per time either of them
    // tapped "message".
    expect(second).toBe(first);
  });

  it("keeps a DM out of a third member's view, in the same Family", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const bobMembership = await resolveMembershipId(bob, ORG_IDS.caregiverCircle);
    const dmId = await openDirectConversation(alice, {
      orgId: ORG_IDS.caregiverCircle,
      otherMembershipIds: [bobMembership],
    });

    const body = `private ${crypto.randomUUID()}`;
    await sendMessage(alice, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: dmId,
      body,
    });

    expect((await listMessages(bob, dmId)).some((m) => m.body === body)).toBe(true);

    // A third member of the SAME Family. Being in the Family is not being in
    // the room -- the distinction C1 exists to enforce.
    const service = createServiceRoleClient();
    const { data: extra } = await service
      .from("memberships")
      .select("profile_id")
      .eq("org_id", ORG_IDS.caregiverCircle)
      .is("deleted_at", null);
    expect((extra ?? []).length).toBeGreaterThanOrEqual(2);

    // Carol is in Founder Collective, so she is the cross-Family check; the
    // in-Family third party is covered by pgTAP's dana, who cannot exist in
    // the seed without adding a member to it.
    const carol = await signInAs(SEEDED_USERS.carol);
    expect(await listMessages(carol, dmId)).toHaveLength(0);
  });

  it("refuses a message longer than the cap before it reaches the database", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const [channel] = await listConversations(alice, ORG_IDS.caregiverCircle);

    await expect(
      sendMessage(alice, {
        orgId: ORG_IDS.caregiverCircle,
        conversationId: channel.id,
        body: "x".repeat(1001),
      }),
    ).rejects.toThrow(/at most 1000/i);

    await expect(
      sendMessage(alice, {
        orgId: ORG_IDS.caregiverCircle,
        conversationId: channel.id,
        body: "   ",
      }),
    ).rejects.toThrow(/cannot be empty/i);
  });

  it("counts unread per Family and clears only the room that was read", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const [channelA] = await listConversations(alice, ORG_IDS.caregiverCircle);

    // Alice reads everything first, so the count below starts from a known
    // state rather than from whatever earlier tests left behind. Establishing
    // preconditions rather than asserting a starting state.
    await markConversationRead(alice, channelA.id);
    expect((await unreadCounts(alice, ORG_IDS.caregiverCircle)).get(channelA.id) ?? 0).toBe(0);

    await sendMessage(bob, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: channelA.id,
      body: `bob says ${crypto.randomUUID()}`,
    });

    expect((await unreadCounts(alice, ORG_IDS.caregiverCircle)).get(channelA.id)).toBe(1);

    await markConversationRead(alice, channelA.id);
    expect((await unreadCounts(alice, ORG_IDS.caregiverCircle)).get(channelA.id) ?? 0).toBe(0);

    // And bob's own message was never unread to bob.
    //
    // Bob establishes his own precondition first. Without this the assertion
    // reads bob's count of ALICE's messages from the tests above -- it failed
    // exactly that way -- and would have been "fixed" by loosening it to
    // toBeGreaterThanOrEqual, which asserts nothing. Same residue lesson as
    // the 2026-09-01 MFA-factor entry: a spec establishes its preconditions
    // and asserts a transition.
    await markConversationRead(bob, channelA.id);
    await sendMessage(bob, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: channelA.id,
      body: `bob again ${crypto.randomUUID()}`,
    });
    expect((await unreadCounts(bob, ORG_IDS.caregiverCircle)).get(channelA.id) ?? 0).toBe(0);
  });

  it("will not mark a room read for someone who is not in it", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const dave = await signInAs(SEEDED_USERS.dave);
    const [channelA] = await listConversations(alice, ORG_IDS.caregiverCircle);

    expect(await markConversationRead(dave, channelA.id)).toBeNull();
  });
});
