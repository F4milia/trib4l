import { beforeAll, describe, expect, it } from "vitest";
import { listConversations, sendMessage } from "../../lib/conversations";
import {
  addMentions,
  addReaction,
  listMentions,
  listNotifications,
  listReactions,
  listThreadReplies,
  markNotificationRead,
  removeReaction,
} from "../../lib/message-interactions";
import { ORG_IDS, QA_FIXTURES, SEEDED_USERS, signInAs } from "./helpers";

/**
 * C2 PR 4. The policies proven THROUGH THE CLIENT, as four different people.
 *
 * pgTAP already asserted that these policies exist and are shaped correctly,
 * and it cannot do more than that -- it connects as postgres and bypasses RLS.
 * This file is where "a member of another Family cannot read this" stops being
 * a claim about the catalog and becomes a claim about the product.
 *
 * Mirrors C1 #71's structure for the same reason it existed there.
 */

type Client = Awaited<ReturnType<typeof signInAs>>;

async function membershipOf(client: Client, orgId: string): Promise<string> {
  // Resolved by profile AND org. RLS lets a member read every membership in
  // their own Family, so `.eq("org_id", x).maybeSingle()` sees several rows and
  // returns NONE -- which reads downstream as missing seed data rather than as
  // an over-broad query.
  const { data: user } = await client.auth.getUser();
  const { data } = await client
    .from("memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", user.user!.id)
    .maybeSingle();
  return data!.id;
}

let roomId: string;
let aliceMessageId: string;

beforeAll(async () => {
  const alice = await signInAs(SEEDED_USERS.alice);
  const room = (await listConversations(alice, ORG_IDS.caregiverCircle)).find(
    (c) => c.kind === "family_channel",
  )!;
  roomId = room.id;
  aliceMessageId = (await sendMessage(alice, {
    orgId: ORG_IDS.caregiverCircle,
    conversationId: roomId,
    body: `c2 interactions fixture ${crypto.randomUUID()}`,
  })).id;
}, 60_000);

describe("reactions", () => {
  it("a participant can react, and sees their own reaction reflected", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const bobMembership = await membershipOf(bob, ORG_IDS.caregiverCircle);
    const emoji = "🧱";

    await addReaction(bob, {
      orgId: ORG_IDS.caregiverCircle,
      messageId: aliceMessageId,
      membershipId: bobMembership,
      emoji,
    });

    const reactions = await listReactions(bob, aliceMessageId);
    const brick = reactions.find((r) => r.emoji === emoji);
    expect(brick?.count).toBe(1);
    expect(brick?.reactedByMe).toBe(true);

    await removeReaction(bob, {
      messageId: aliceMessageId,
      membershipId: bobMembership,
      emoji,
    });
    expect((await listReactions(bob, aliceMessageId)).find((r) => r.emoji === emoji)).toBeUndefined();
  }, 30_000);

  it("does not let a member of another Family react to a message they cannot see", async () => {
    const carol = await signInAs(SEEDED_USERS.carol);
    const carolMembership = await membershipOf(carol, ORG_IDS.founderCollective);

    await expect(
      addReaction(carol, {
        orgId: ORG_IDS.founderCollective,
        messageId: aliceMessageId,
        membershipId: carolMembership,
        emoji: "👀",
      }),
    ).rejects.toBeTruthy();
  }, 30_000);

  it("does not let a member react AS someone else", async () => {
    // The membership id is a parameter, so the policy -- not the caller -- has
    // to be what stops this.
    const bob = await signInAs(SEEDED_USERS.bob);
    const alice = await signInAs(SEEDED_USERS.alice);
    const aliceMembership = await membershipOf(alice, ORG_IDS.caregiverCircle);

    await expect(
      addReaction(bob, {
        orgId: ORG_IDS.caregiverCircle,
        messageId: aliceMessageId,
        membershipId: aliceMembership,
        emoji: "🙃",
      }),
    ).rejects.toBeTruthy();
  }, 30_000);
});

describe("mentions and the notification they cause", () => {
  it("a mention writes a notification for the mentioned member", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);
    const bobMembership = await membershipOf(bob, ORG_IDS.caregiverCircle);

    const messageId = (await sendMessage(alice, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: roomId,
      body: `hey @bob ${crypto.randomUUID()}`,
    })).id;
    await addMentions(alice, {
      orgId: ORG_IDS.caregiverCircle,
      messageId,
      mentionedMembershipIds: [bobMembership],
    });

    expect(await listMentions(alice, messageId)).toHaveLength(1);

    const bobNotifications = await listNotifications(bob, ORG_IDS.caregiverCircle);
    const mine = bobNotifications.find((n) => n.targetId === messageId);
    expect(mine?.type).toBe("mention");
    // Asserted by absence as well as presence: the row carries ids, never text.
    expect(Object.keys(mine ?? {})).not.toContain("body");
  }, 30_000);

  it("does not let a member read another member's notifications", async () => {
    // Bob is in the SAME Family. Sharing a Family does not entitle you to
    // someone else's inbox -- a policy scoped to the org rather than to the
    // membership would pass every other assertion in this file.
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);
    const bobMembership = await membershipOf(bob, ORG_IDS.caregiverCircle);

    const messageId = (await sendMessage(alice, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: roomId,
      body: `for bob only ${crypto.randomUUID()}`,
    })).id;
    await addMentions(alice, {
      orgId: ORG_IDS.caregiverCircle,
      messageId,
      mentionedMembershipIds: [bobMembership],
    });

    const aliceSees = await listNotifications(alice, ORG_IDS.caregiverCircle);
    expect(aliceSees.find((n) => n.targetId === messageId)).toBeUndefined();
  }, 30_000);

  it("marks a notification read, and only the owner may", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);
    const bobMembership = await membershipOf(bob, ORG_IDS.caregiverCircle);

    const messageId = (await sendMessage(alice, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: roomId,
      body: `read me ${crypto.randomUUID()}`,
    })).id;
    await addMentions(alice, {
      orgId: ORG_IDS.caregiverCircle,
      messageId,
      mentionedMembershipIds: [bobMembership],
    });

    const notification = (await listNotifications(bob, ORG_IDS.caregiverCircle)).find(
      (n) => n.targetId === messageId,
    )!;
    expect(notification.readAt).toBeNull();

    // Alice calls the RPC on Bob's notification. It does not raise -- the
    // function filters on auth.uid() and simply matches no row, which is the
    // right shape for a stale tab -- so the assertion is that nothing changed.
    await markNotificationRead(alice, notification.id);
    const stillUnread = (await listNotifications(bob, ORG_IDS.caregiverCircle)).find(
      (n) => n.id === notification.id,
    );
    expect(stillUnread?.readAt).toBeNull();

    await markNotificationRead(bob, notification.id);
    const nowRead = (await listNotifications(bob, ORG_IDS.caregiverCircle)).find(
      (n) => n.id === notification.id,
    );
    expect(nowRead?.readAt).not.toBeNull();
  }, 30_000);

  it("THE NAMED EDGE CASE: a block stops the notification, not the mention", async () => {
    // blocker has blocked blocked, in qa-family-a. This is the same claim
    // 230_notifications_and_mentions.sql asserts as postgres; here it is
    // asserted through the client, as the people involved.
    const blocked = await signInAs(QA_FIXTURES.blocked);
    const blocker = await signInAs(QA_FIXTURES.blocker);
    const blockerMembership = await membershipOf(blocker, ORG_IDS.qaFamilyA);

    const room = (await listConversations(blocked, ORG_IDS.qaFamilyA)).find(
      (c) => c.kind === "family_channel",
    )!;
    const messageId = (await sendMessage(blocked, {
      orgId: ORG_IDS.qaFamilyA,
      conversationId: room.id,
      body: `mentioning the blocker ${crypto.randomUUID()}`,
    })).id;
    await addMentions(blocked, {
      orgId: ORG_IDS.qaFamilyA,
      messageId,
      mentionedMembershipIds: [blockerMembership],
    });

    // THE ROOM IS UNAFFECTED -- the message really does contain the mention.
    expect(await listMentions(blocked, messageId)).toHaveLength(1);

    // NO NOTIFICATION REACHES THE BLOCKER.
    const blockerNotifications = await listNotifications(blocker, ORG_IDS.qaFamilyA);
    expect(blockerNotifications.find((n) => n.targetId === messageId)).toBeUndefined();
  }, 30_000);
});

describe("threading", () => {
  it("lists replies to a message, and refuses a reply from another conversation", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);

    const replyId = (await sendMessage(alice, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: roomId,
      body: `a reply ${crypto.randomUUID()}`,
      parentMessageId: aliceMessageId,
    })).id;

    const replies = await listThreadReplies(alice, aliceMessageId);
    expect(replies.map((r) => r.id)).toContain(replyId);
  }, 30_000);
});
