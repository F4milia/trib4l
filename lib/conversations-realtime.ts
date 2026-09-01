import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { Message } from "./conversations";

/**
 * C1 PR 6. Live delivery for one open conversation.
 *
 * THE ISOLATION IS NOT HERE, FOR ROWS. Supabase Realtime evaluates RLS per
 * subscriber before forwarding a row, so this module never filters
 * postgres_changes for security -- it filters by conversation_id only so that
 * an open room does not re-render for traffic in a different one. If a MESSAGE
 * arrives here, the database already decided this subscriber may see it, blocks
 * included.
 *
 * That guarantee covers postgres_changes and NOTHING ELSE. The typing handler
 * below is a broadcast, which no policy gates -- see sendTyping().
 *
 * That is worth being explicit about, because the tempting shape is to check
 * membership in the callback "to be safe". A check here would be a second
 * source of truth that can drift from the policy, and it would be the one
 * nobody tests.
 */

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

export type ConversationEvents = {
  onMessage?: (message: Message) => void;
  /** A message edited or soft-deleted. `deleted` distinguishes the two. */
  onMessageChanged?: (message: Message, deleted: boolean) => void;
  /** Someone's read mark moved, or they joined/left. */
  onParticipantsChanged?: () => void;
  /** Someone is typing. Ephemeral -- broadcast, never stored. */
  onTyping?: (membershipId: string) => void;
};

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorMembershipId: row.author_membership_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.updated_at !== row.created_at ? row.updated_at : null,
  };
}

/**
 * Subscribes to one conversation. Returns the channel so the caller can
 * unsubscribe -- every caller must, or a member who opens ten rooms in a
 * session holds ten sockets open.
 */
export type SubscriptionStatus =
  | "SUBSCRIBED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | "CLOSED";

export function subscribeToConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  events: ConversationEvents,
  /**
   * Called with the server's own answer to the subscribe.
   *
   * Worth having rather than assuming: a channel reaches state "joined" as
   * soon as the socket is up, which is BEFORE the server has established the
   * postgres_changes bindings. Treating "joined" as ready loses the first
   * events after a cold start -- measured, as a test that passed on a warm
   * stack and failed on the run straight after a container restart. Only
   * SUBSCRIBED means the bindings exist.
   */
  onStatus?: (status: SubscriptionStatus) => void,
): RealtimeChannel {
  const channel = supabase.channel(`conversation:${conversationId}`);

  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      const row = payload.new as MessageRow;
      // A message that arrives already soft-deleted is not news.
      if (row.deleted_at) return;
      events.onMessage?.(toMessage(row));
    },
  );

  channel.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      const row = payload.new as MessageRow;
      events.onMessageChanged?.(toMessage(row), row.deleted_at !== null);
    },
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "conversation_participants",
      filter: `conversation_id=eq.${conversationId}`,
    },
    () => events.onParticipantsChanged?.(),
  );

  /**
   * Typing is BROADCAST, not a table.
   *
   * It is true for about three seconds and interesting to nobody afterwards.
   * Storing it would mean a write per keystroke-burst per member on the
   * highest-write table's neighbour, an audit row for each (invariant 5 has no
   * "except trivia" clause), and a row in the Ledger's own database recording
   * that someone began typing and thought better of it.
   *
   * That reasoning is about COST and is unchanged. It is not a claim about
   * access: a broadcast reaches anyone who joined the channel, participant or
   * not. See sendTyping().
   */
  channel.on("broadcast", { event: "typing" }, ({ payload }) => {
    const membershipId = (payload as { membershipId?: string })?.membershipId;
    if (membershipId) events.onTyping?.(membershipId);
  });

  channel.subscribe((status) => onStatus?.(status as SubscriptionStatus));
  return channel;
}

/**
 * Announces that this member is typing.
 *
 * Broadcast is NOT ACCESS-CONTROLLED, in either direction. It carries whatever
 * the sender puts in it, and -- measured 2026-09-02 -- ANY authenticated client
 * may join ANY channel by name and receive it. A channel is a string; there is
 * no row for a policy to be evaluated against, so the database does not gate
 * the join.
 *
 * An earlier version of this comment claimed delivery reached "only people
 * already subscribed to a channel the database let them join". That was wrong,
 * and it was wrong in the direction that matters. The probe: a member of
 * Family B joined `conversation:<a Family A uuid>` and received Family A's
 * typing events, while a postgres_changes subscription on the same channel for
 * the same user delivered nothing.
 *
 * So the payload stays a membership id and nothing else. What leaks today is
 * that someone is active in a room -- to anyone holding its id, including a
 * member who has since been removed from the Family and still has it in their
 * browser history.
 *
 * DO NOT extend this to carry message text, display names, or anything a
 * non-participant must not read. Gating the join needs Realtime Authorization
 * (RLS on realtime.messages); that is owed to C2 --
 * docs/f4milia/c2-realtime-broadcast-authorization.md.
 */
export function sendTyping(channel: RealtimeChannel, membershipId: string): void {
  void channel.send({
    type: "broadcast",
    event: "typing",
    payload: { membershipId },
  });
}

/** How long a typing indicator stays up without a further keystroke. */
export const TYPING_TIMEOUT_MS = 3000;

/** How often to re-announce while someone keeps typing. */
export const TYPING_THROTTLE_MS = 1500;
