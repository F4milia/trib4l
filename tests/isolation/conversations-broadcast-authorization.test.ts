import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  listConversations,
  sendMessage,
} from "../../lib/conversations";
import {
  subscribeToConversation,
  sendTyping,
} from "../../lib/conversations-realtime";
import { ORG_IDS, SEEDED_USERS, signInAs } from "./helpers";

/**
 * C2 PR 1. The finding C1 carried forward:
 * docs/f4milia/c2-realtime-broadcast-authorization.md
 *
 * Broadcast has no row for a policy to be evaluated against, so before this
 * change a channel was a string and any authenticated client could join any
 * channel by name. The fix gates the JOIN instead: `private: true` on the
 * client, RLS on realtime.messages on the server.
 *
 * WHY THE ORDER OF THESE TESTS MATTERS. "Carol received nothing" is not
 * evidence -- realtime being broken in the environment looks exactly the same.
 * So the participant control runs FIRST and has to actually receive something.
 * Only then does a refusal mean anything.
 *
 * The doc's §5.3 asks for precisely this pairing, and it is the same lesson as
 * C1 PR2's: a file that only asserts refusals passes with the policy deleted.
 */

const open: RealtimeChannel[] = [];

function track(channel: RealtimeChannel): RealtimeChannel {
  open.push(channel);
  return channel;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.unsubscribe()));
});

function nextTick(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type Client = Parameters<typeof subscribeToConversation>[0];

/** Resolves on SUBSCRIBED, rejects on the server refusing the join. */
function subscribeAndWait(
  client: Client,
  conversationId: string,
  events: Parameters<typeof subscribeToConversation>[2],
  ms = 15000,
): Promise<RealtimeChannel> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("channel never reached SUBSCRIBED")),
      ms,
    );
    const channel = track(
      subscribeToConversation(client, conversationId, events, (status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve(channel);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(`subscription refused: ${status}`));
        }
      }),
    );
  });
}

/**
 * Realtime has three levels of readiness and only the third is real: the
 * socket up, the SUBSCRIBED ack, and messages actually streaming. After a
 * database reset the service re-establishes its replication slot and acks
 * subscriptions while streaming nothing for a few seconds. CI resets
 * immediately before this suite, so warming up on a probe MESSAGE rather than
 * on any reported status is the difference between green and a coin toss.
 */
async function waitForRealtimeStreaming(timeoutMs = 60_000): Promise<void> {
  const alice = await signInAs(SEEDED_USERS.alice);
  const bob = await signInAs(SEEDED_USERS.bob);
  const room = (await listConversations(alice, ORG_IDS.caregiverCircle)).find(
    (c) => c.kind === "family_channel",
  )!;

  const seen: string[] = [];
  const channel = await subscribeAndWait(bob, room.id, {
    onMessage: (m) => seen.push(m.body),
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = `warmup ${crypto.randomUUID()}`;
    await sendMessage(alice, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: room.id,
      body: probe,
    });
    for (let i = 0; i < 20; i++) {
      if (seen.includes(probe)) {
        await channel.unsubscribe();
        return;
      }
      await nextTick(100);
    }
  }
  await channel.unsubscribe();
  throw new Error("realtime never began streaming within the timeout");
}

describe("realtime broadcast authorization", () => {
  beforeAll(async () => {
    await waitForRealtimeStreaming();
  }, 90_000);

  it("delivers typing to a participant -- the control that makes the refusal mean something", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const room = (await listConversations(alice, ORG_IDS.caregiverCircle)).find(
      (c) => c.kind === "family_channel",
    )!;

    const seen: string[] = [];
    await subscribeAndWait(bob, room.id, {
      onTyping: (membershipId) => seen.push(membershipId),
    });
    const aliceChannel = await subscribeAndWait(alice, room.id, {});

    const marker = crypto.randomUUID();
    // Re-send: the receiver's binding and the sender's join race, and a
    // broadcast has no replay. A single send is the flakiest possible shape.
    for (let i = 0; i < 40 && !seen.includes(marker); i++) {
      sendTyping(aliceChannel, marker);
      await nextTick(100);
    }

    expect(seen).toContain(marker);
  }, 40_000);

  it("refuses the join to a member of another Family holding the conversation id", async () => {
    // Carol is in Founder Collective only. This is the case that actually
    // matters, in its milder form: someone who has the id and no right to it.
    const alice = await signInAs(SEEDED_USERS.alice);
    const carol = await signInAs(SEEDED_USERS.carol);

    const room = (await listConversations(alice, ORG_IDS.caregiverCircle)).find(
      (c) => c.kind === "family_channel",
    )!;

    await expect(
      subscribeAndWait(carol, room.id, {}, 12_000),
    ).rejects.toThrow(/refused/);
  }, 30_000);

  it("still delivers postgres_changes to a participant on the now-private channel", async () => {
    // The regression this PR was most likely to cause, and the question the
    // blockers doc flagged as reasoned rather than measured: `private: true`
    // routes the JOIN through realtime.messages RLS, and if that also gated
    // the row path -- or if the join policy were subtly wrong -- C1's live
    // message stream would go silent for legitimate participants.
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const room = (await listConversations(alice, ORG_IDS.caregiverCircle)).find(
      (c) => c.kind === "family_channel",
    )!;

    const received: string[] = [];
    await subscribeAndWait(bob, room.id, {
      onMessage: (m) => received.push(m.body),
    });

    const body = `private-channel row path ${crypto.randomUUID()}`;
    await sendMessage(alice, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: room.id,
      body,
    });

    for (let i = 0; i < 60 && !received.includes(body); i++) await nextTick(100);
    expect(received).toContain(body);
  }, 40_000);
});
