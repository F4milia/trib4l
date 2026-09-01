import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  listConversations,
  resolveMembershipId,
  openDirectConversation,
  sendMessage,
} from "../../lib/conversations";
import { subscribeToConversation } from "../../lib/conversations-realtime";
import { ORG_IDS, SEEDED_USERS, signInAs } from "./helpers";

/**
 * C1 PR 6. The acceptance criterion "messages appear live without refresh",
 * and the claim underneath it that matters more: the live path enforces the
 * SAME isolation as the read path.
 *
 * This is the file that would catch a realtime subscription bypassing RLS.
 * Every other test in this session queries; only this one subscribes, and a
 * publication is a genuinely different code path inside Postgres and inside
 * Realtime. "The policy is correct" and "the socket honours the policy" are
 * two claims, and the second has historically been where chat products leak.
 */

const open: RealtimeChannel[] = [];

function track(channel: RealtimeChannel): RealtimeChannel {
  open.push(channel);
  return channel;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.unsubscribe()));
});

/**
 * Subscribes and resolves on the server's SUBSCRIBED ack.
 *
 * NOT on channel.state === "joined": that is true as soon as the socket is up,
 * before the postgres_changes bindings exist, so the first message after a
 * cold start is silently missed. This test failed exactly that way on the run
 * immediately after a container restart and passed on every warm run -- which
 * is the worst possible shape for a bug to have.
 */
function subscribeAndWait(
  client: Parameters<typeof subscribeToConversation>[0],
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
          reject(new Error(`subscription failed: ${status}`));
        }
      }),
    );
  });
}

function nextTick(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Waits until a message genuinely flows end to end.
 *
 * SUBSCRIBED is necessary and NOT sufficient. After `supabase db reset` the
 * Realtime service has to re-establish its replication slot against the new
 * database, and for a few seconds it accepts subscriptions and acks them while
 * streaming nothing. Measured here: the first test failed on the run straight
 * after a reset and passed on every warm run, both before and after switching
 * from channel.state to the SUBSCRIBED ack.
 *
 * So readiness is defined as the only thing that actually matters -- a probe
 * message arriving -- rather than as any status the client reports. CI resets
 * the database immediately before this suite, so without this the first
 * assertion is a coin toss there and green locally.
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

describe("realtime delivery", () => {
  beforeAll(async () => {
    await waitForRealtimeStreaming();
  }, 90_000);

  it("delivers a new message to another member of the room, without a refetch", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const channelRow = (await listConversations(alice, ORG_IDS.caregiverCircle)).find(
      (c) => c.kind === "family_channel",
    )!;

    const received: string[] = [];
    await subscribeAndWait(bob, channelRow.id, {
      onMessage: (m) => received.push(m.body),
    });

    const body = `live ${crypto.randomUUID()}`;
    await sendMessage(alice, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: channelRow.id,
      body,
    });

    // Poll rather than a fixed sleep: a fixed wait is either flaky or slow,
    // and this reports the real latency budget when it fails.
    for (let i = 0; i < 60 && !received.includes(body); i++) await nextTick(100);

    expect(received).toContain(body);
  }, 30_000);

  it("does not deliver a DM to a member of another Family who is subscribed to it", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);
    const carol = await signInAs(SEEDED_USERS.carol);

    const bobMembership = await resolveMembershipId(bob, ORG_IDS.caregiverCircle);
    const dmId = await openDirectConversation(alice, {
      orgId: ORG_IDS.caregiverCircle,
      otherMembershipIds: [bobMembership],
    });

    // Carol is in Founder Collective. She subscribes to Caregiver Circle's DM
    // by id -- nothing stops a client from ASKING; the question is whether the
    // server sends. This is the leak the whole session is defending against,
    // on the one path that does not go through PostgREST.
    //
    // STRENGTHENED BY C2 PR 1, not weakened. Until Realtime Authorization
    // landed, this join SUCCEEDED and the assertion below was "she is in the
    // room and receives no rows" -- true, and carried entirely by
    // postgres_changes RLS. The channel is now `private: true`, so the join
    // itself is evaluated against realtime.messages and Carol is refused
    // before any row path is consulted.
    //
    // Both claims are kept. The refusal is the new, earlier guarantee; the
    // empty array still asserts the row path independently, so if a future
    // change makes the channel public again this test fails on the refusal
    // rather than passing quietly on the weaker half.
    const leaked: string[] = [];
    await expect(
      subscribeAndWait(carol, dmId, { onMessage: (m) => leaked.push(m.body) }, 12_000),
    ).rejects.toThrow(/CHANNEL_ERROR|TIMED_OUT/);

    // Bob is a real participant, and subscribes too -- so a failure to receive
    // is distinguishable from realtime simply not working in this environment.
    // Without this control, "carol got nothing" is not evidence of isolation.
    const delivered: string[] = [];
    await subscribeAndWait(bob, dmId, {
      onMessage: (m) => delivered.push(m.body),
    });

    const body = `dm ${crypto.randomUUID()}`;
    await sendMessage(alice, {
      orgId: ORG_IDS.caregiverCircle,
      conversationId: dmId,
      body,
    });

    for (let i = 0; i < 60 && !delivered.includes(body); i++) await nextTick(100);

    expect(delivered).toContain(body);
    expect(leaked).toHaveLength(0);
  }, 30_000);

  it("carries a typing broadcast between participants", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const channelRow = (await listConversations(alice, ORG_IDS.caregiverCircle)).find(
      (c) => c.kind === "family_channel",
    )!;
    const aliceMembership = await resolveMembershipId(alice, ORG_IDS.caregiverCircle);

    const typing: string[] = [];
    await subscribeAndWait(bob, channelRow.id, {
      onTyping: (id) => typing.push(id),
    });

    const aliceSub = await subscribeAndWait(alice, channelRow.id, {});

    const { sendTyping } = await import("../../lib/conversations-realtime");
    sendTyping(aliceSub, aliceMembership);

    for (let i = 0; i < 60 && typing.length === 0; i++) await nextTick(100);

    expect(typing).toContain(aliceMembership);
  }, 30_000);
});
