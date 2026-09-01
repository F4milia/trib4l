import { describe, expect, it } from "vitest";
import {
  listConversations,
  markConversationRead,
  sendMessage,
  unreadCounts,
} from "../../lib/conversations";
import { ORG_IDS, QA_FIXTURES, SEEDED_USERS, signInAs } from "./helpers";

/**
 * Stream A unblocking, PR 13. The C1 defect owed to N1.
 *
 * unread_message_counts() took no argument, so one call spanned every Family
 * the caller belongs to. Every row it returned was correct -- RLS held, the
 * function is SECURITY INVOKER, the caller may see each conversation. What was
 * wrong was the SET: a dual-Family member asking "what is unread" got one
 * answer covering both Families, and a badge that sums it renders a
 * cross-Family number inside one Family's UI.
 *
 * The dual-Family user is the canonical fixture for exactly this, and this is
 * the file where it earns that title: the bug is INVISIBLE to a single-Family
 * account, which is why it survived C1 and was still here for N1 to inherit.
 */

describe("unread counts are scoped to one Family", () => {
  it("does not report Family B's unread messages when asked about Family A", async () => {
    // dual is org_owner of qa-family-a and a member of qa-family-b.
    const dual = await signInAs(QA_FIXTURES.dual);

    const [roomA] = await listConversations(dual, ORG_IDS.qaFamilyA);
    const [roomB] = await listConversations(dual, ORG_IDS.qaFamilyB);

    // Establish preconditions rather than assert a starting state: both rooms
    // read, so what follows is a transition and not whatever an earlier file
    // left behind.
    await markConversationRead(dual, roomA.id);
    await markConversationRead(dual, roomB.id);

    // Someone else posts in FAMILY A only.
    //
    // The direction is forced by the seed, and the reason is worth recording:
    // `dual` is the ONLY member of qa-family-b, and a member's own message is
    // never unread to them -- so no unread message can exist in Family B
    // without extending the seed, which is Stream B's surface. Family A has
    // `second`, `blocker`, `blocked` and `memorial`, so the message goes there
    // and the assertion runs the other way. The claim is symmetric either way.
    const second = await signInAs(QA_FIXTURES.second);
    await sendMessage(second, {
      orgId: ORG_IDS.qaFamilyA,
      conversationId: roomA.id,
      body: `pr13 family-a only ${crypto.randomUUID()}`,
    });

    const countsA = await unreadCounts(dual, ORG_IDS.qaFamilyA);
    const countsB = await unreadCounts(dual, ORG_IDS.qaFamilyB);

    // The transition: Family A's room now has an unread message.
    expect(countsA.get(roomA.id)).toBe(1);

    // And the defect this PR removes. Before the org argument existed, ONE
    // call returned every Family's rooms at once -- so a badge rendered inside
    // Family B's UI counted a message sent in Family A.
    expect(countsB.has(roomA.id)).toBe(false);
    expect(countsB.get(roomB.id) ?? 0).toBe(0);
    expect(countsA.has(roomB.id)).toBe(false);
  }, 30_000);

  it("counts a real message in the Family it was sent to, and only there", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const [caregiverRoom] = await listConversations(alice, ORG_IDS.caregiverCircle);

    await markConversationRead(alice, caregiverRoom.id);
    expect((await unreadCounts(alice, ORG_IDS.caregiverCircle)).get(caregiverRoom.id) ?? 0).toBe(0);

    await sendMessage(bob, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: caregiverRoom.id,
      body: `pr13 ${crypto.randomUUID()}`,
    });

    // Asserted as a transition -- 0 then 1 -- rather than against a constant,
    // because a shared database makes any absolute count an order-dependent
    // assertion wearing a precise-looking number.
    expect((await unreadCounts(alice, ORG_IDS.caregiverCircle)).get(caregiverRoom.id)).toBe(1);

    // Alice is a mentor in Founder Collective. That Family's counts must not
    // have moved.
    const founderCounts = await unreadCounts(alice, ORG_IDS.founderCollective);
    expect(founderCounts.has(caregiverRoom.id)).toBe(false);

    await markConversationRead(alice, caregiverRoom.id);
    expect((await unreadCounts(alice, ORG_IDS.caregiverCircle)).get(caregiverRoom.id) ?? 0).toBe(0);
  }, 30_000);

  it("returns nothing for a Family the caller does not belong to", async () => {
    // Not an error, and deliberately so: an empty result is what a stale tab
    // should get. Raising would turn a routine race into a stack trace.
    const carol = await signInAs(SEEDED_USERS.carol);
    const counts = await unreadCounts(carol, ORG_IDS.caregiverCircle);
    expect(counts.size).toBe(0);
  }, 30_000);
});
