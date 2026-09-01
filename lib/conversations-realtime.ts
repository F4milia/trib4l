import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { Message } from "./conversations";

/**
 * C1 PR 6. Live delivery for one open conversation.
 *
 * THE ISOLATION IS NOT HERE. Supabase Realtime evaluates RLS per subscriber
 * before forwarding a row, so this module never filters for security -- it
 * filters by conversation_id only so that an open room does not re-render for
 * traffic in a different one. If a message arrives here, the database already
 * decided this subscriber may see it, blocks included.
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
 * Broadcast carries whatever the sender puts in it -- it is not policed by
 * RLS, because there is no row to evaluate a policy against. That is
 * acceptable for exactly this payload and would not be for anything else: the
 * worst a forged typing event can do is show a name in an indicator, and only
 * to people already subscribed to a channel the database let them join. Do not
 * extend this to carry message text.
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
