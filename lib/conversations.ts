import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

/**
 * C1 PR 5. The server-side read and write paths for Family conversations.
 *
 * EVERY FUNCTION HERE TAKES THE CALLER'S OWN CLIENT, never a service-role one.
 * CLAUDE.md invariant 5: "every new read path goes THROUGH policy -- never a
 * service-role shortcut with filtering on top." The filtering these functions
 * do is for ordering and shape; the isolation is entirely the database's, and
 * the isolation tests prove that by running the same calls as four different
 * people.
 *
 * There is deliberately no "getConversationForAdmin" or similar. If one is
 * ever needed, it belongs behind a policy that names platform_admin, not
 * behind a client that bypasses policies.
 */

export type ConversationKind = Database["public"]["Enums"]["conversation_kind"];

export type Conversation = {
  id: string;
  orgId: string;
  kind: ConversationKind;
  title: string | null;
  createdAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  authorMembershipId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  /** C2. The message this replies to, or null for a top-level message. */
  parentMessageId?: string | null;
};

export class NotAMemberOfThisFamily extends Error {
  constructor() {
    super("You are not a member of this Family.");
    this.name = "NotAMemberOfThisFamily";
  }
}

/**
 * The caller's membership in one Family.
 *
 * Resolved rather than passed in, everywhere, and this is the whole reason the
 * schema keys participation on membership_id: a caller who is in Families A
 * and B has two memberships, and "which one is acting" is a question with a
 * correct answer that the client should never be trusted to supply. Passing a
 * membership id from the browser would make it a claim.
 */
export async function resolveMembershipId(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const profileId = auth.user?.id;
  if (!profileId) throw new NotAMemberOfThisFamily();

  const { data, error } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotAMemberOfThisFamily();
  return data.id;
}

/**
 * Every room the caller can see in one Family.
 *
 * Filtered by org_id as well as relying on RLS. That is not belt-and-braces
 * for security -- the policy is the security -- it is because a member of two
 * Families would otherwise get both Families' rooms in one list, which is a
 * correctness bug in the UI rather than a leak.
 */
export async function listConversations(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, org_id, kind, title, created_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    kind: row.kind,
    title: row.title,
    createdAt: row.created_at,
  }));
}

/**
 * One room's messages, oldest last.
 *
 * Ordered created_at DESC then reversed, so `limit` takes the NEWEST n rather
 * than the oldest n -- opening a long-running channel should show what was
 * just said, not what was said when it was created. The index from PR 1 is
 * (conversation_id, created_at desc) for exactly this query.
 */
export async function listMessages(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  limit = 50,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, author_membership_id, body, created_at, updated_at, deleted_at, parent_message_id",
    )
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      authorMembershipId: row.author_membership_id,
      body: row.body,
      createdAt: row.created_at,
      // updated_at only differs from created_at once someone has edited.
      editedAt: row.updated_at !== row.created_at ? row.updated_at : null,
      parentMessageId: row.parent_message_id,
    }))
    .reverse();
}

/** Matches the CHECK on messages.body. Kept here so the UI can say so first. */
export const MESSAGE_MAX_LENGTH = 1000;

export class MessageTooLong extends Error {
  constructor() {
    super(`A message can be at most ${MESSAGE_MAX_LENGTH} characters.`);
    this.name = "MessageTooLong";
  }
}

export class MessageEmpty extends Error {
  constructor() {
    super("A message cannot be empty.");
    this.name = "MessageEmpty";
  }
}

export async function sendMessage(
  supabase: SupabaseClient<Database>,
  args: {
    orgId: string;
    conversationId: string;
    body: string;
    /**
     * C2. The message this one replies to, if any.
     *
     * Not validated here. A BEFORE trigger asserts the parent is in the same
     * conversation, and re-checking in TypeScript would restate that guarantee
     * somewhere it can drift -- and somewhere a service-role caller would skip
     * entirely.
     */
    parentMessageId?: string;
  },
): Promise<Message> {
  // Trimmed before measuring, so a message of 1000 characters plus a trailing
  // newline is not refused for being 1001 long.
  const body = args.body.trim();
  if (body.length === 0) throw new MessageEmpty();
  if (body.length > MESSAGE_MAX_LENGTH) throw new MessageTooLong();

  const authorMembershipId = await resolveMembershipId(supabase, args.orgId);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      org_id: args.orgId,
      conversation_id: args.conversationId,
      author_membership_id: authorMembershipId,
      body,
      parent_message_id: args.parentMessageId ?? null,
    })
    .select(
      "id, conversation_id, author_membership_id, body, created_at, updated_at, parent_message_id",
    )
    .single();

  if (error) throw error;
  return {
    id: data.id,
    conversationId: data.conversation_id,
    authorMembershipId: data.author_membership_id,
    body: data.body,
    createdAt: data.created_at,
    editedAt: null,
    parentMessageId: data.parent_message_id,
  };
}

/**
 * Opens (or re-opens) a direct conversation.
 *
 * Through the RPC rather than two inserts: the conversation and its
 * participants have to appear together or not at all, and PostgREST cannot
 * wrap two calls in a transaction. The RPC also returns the EXISTING room when
 * one already holds exactly these people, so messaging someone twice does not
 * produce two half-conversations.
 */
export async function openDirectConversation(
  supabase: SupabaseClient<Database>,
  args: { orgId: string; otherMembershipIds: string[] },
): Promise<string> {
  const { data, error } = await supabase.rpc("create_direct_conversation", {
    check_org_id: args.orgId,
    other_membership_ids: args.otherMembershipIds,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Unread counts for one Family's rooms, keyed by conversation id.
 *
 * orgId is required, and that is the point. The first version took no argument
 * and returned counts for every Family the caller belongs to at once -- correct
 * row by row, wrong as a set. Any surface that sums it renders a cross-Family
 * number inside one Family's UI, which is invariant 6 defeated by arithmetic
 * rather than by content. N1 turns these into notification badges.
 */
export async function unreadCounts(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("unread_message_counts", {
    check_org_id: orgId,
  });
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.conversation_id, Number(row.unread_count));
  }
  return counts;
}

/**
 * Moves the caller's read mark to now. Returns the new mark, or null if the
 * caller is not in the room -- the RPC answers null rather than raising,
 * because "you are not in this room" is not an error worth a stack trace when
 * it happens on a stale tab.
 */
export async function markConversationRead(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("mark_conversation_read", {
    check_conversation_id: conversationId,
  });
  if (error) throw error;
  return data as string | null;
}
