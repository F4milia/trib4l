import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

/**
 * C2. Mentions, reactions, threading and attachments -- the read and write
 * paths for everything C2 added to a message.
 *
 * SAME RULE AS lib/conversations.ts: every function takes the CALLER'S OWN
 * client, never a service-role one. Invariant 5 -- "every new read path goes
 * THROUGH policy, never a service-role shortcut with filtering on top." The
 * shaping done here is for ordering and convenience; the isolation is entirely
 * the database's, and tests/isolation/message-interactions.test.ts proves that
 * by making the same calls as four different people.
 *
 * There is deliberately no function that takes a membership id and "checks"
 * whether the caller may act as it. A check here would be a second source of
 * truth that can drift from the policy, and it would be the one nobody tests.
 */

export type Reaction = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export type Mention = {
  id: string;
  messageId: string;
  mentionedMembershipId: string;
};

export type Attachment = {
  id: string;
  messageId: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
};

export type Notification = {
  id: string;
  type: Database["public"]["Enums"]["notification_type"];
  targetType: string;
  targetId: string;
  actorMembershipId: string | null;
  readAt: string | null;
  createdAt: string;
};

/** Raised when an upload would exceed a cap. Carries the plain sentence. */
export class AttachmentRefused extends Error {}

/* ------------------------------------------------------------------ threads */

/**
 * Replies to one message, oldest first.
 *
 * The parent's own conversation is not passed and not checked here: the
 * child-matches-parent trigger guarantees every reply is in the parent's
 * conversation, and the SELECT policy decides visibility. Re-checking would
 * restate the trigger in TypeScript, where it can drift.
 */
export async function listThreadReplies(
  supabase: SupabaseClient<Database>,
  parentMessageId: string,
): Promise<Database["public"]["Tables"]["messages"]["Row"][]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("parent_message_id", parentMessageId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/* ---------------------------------------------------------------- reactions */

/**
 * Reaction counts for one message.
 *
 * Goes through message_reaction_counts(), which is SECURITY INVOKER -- so a
 * blocked member's reaction is absent from the NUMBER as well as from the list.
 * Counting here in TypeScript instead would count rows the caller can see,
 * which is the same answer today and stops being the same answer the moment
 * anyone adds a filter.
 */
export async function listReactions(
  supabase: SupabaseClient<Database>,
  messageId: string,
): Promise<Reaction[]> {
  const { data, error } = await supabase.rpc("message_reaction_counts", {
    check_message_id: messageId,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    emoji: row.emoji,
    count: Number(row.reaction_count),
    reactedByMe: Boolean(row.reacted_by_me),
  }));
}

export async function addReaction(
  supabase: SupabaseClient<Database>,
  args: { orgId: string; messageId: string; membershipId: string; emoji: string },
): Promise<void> {
  const { error } = await supabase.from("message_reactions").insert({
    org_id: args.orgId,
    message_id: args.messageId,
    membership_id: args.membershipId,
    emoji: args.emoji,
  });
  if (error) throw error;
}

/**
 * Removes the caller's own reaction.
 *
 * There is no "change my reaction": message_reactions has no UPDATE grant, on
 * purpose. Changing one is a delete and an insert, because an UPDATE grant on a
 * join-shaped table means "you may edit any column of your own row" -- and one
 * of those columns is message_id.
 */
export async function removeReaction(
  supabase: SupabaseClient<Database>,
  args: { messageId: string; membershipId: string; emoji: string },
): Promise<void> {
  const { error } = await supabase
    .from("message_reactions")
    .delete()
    .eq("message_id", args.messageId)
    .eq("membership_id", args.membershipId)
    .eq("emoji", args.emoji);
  if (error) throw error;
}

/* ----------------------------------------------------------------- mentions */

/**
 * Attaches mentions to a message the caller just wrote.
 *
 * The notification is NOT created here. A trigger does it, which is what makes
 * the block check unavoidable: a caller that forgot to filter blocked members
 * cannot accidentally notify one, because the caller never writes the
 * notification at all. Doing it in application code would make invariant 6 a
 * thing every caller has to remember.
 */
export async function addMentions(
  supabase: SupabaseClient<Database>,
  args: { orgId: string; messageId: string; mentionedMembershipIds: string[] },
): Promise<void> {
  if (args.mentionedMembershipIds.length === 0) return;
  const { error } = await supabase.from("message_mentions").insert(
    args.mentionedMembershipIds.map((id) => ({
      org_id: args.orgId,
      message_id: args.messageId,
      mentioned_membership_id: id,
    })),
  );
  if (error) throw error;
}

export async function listMentions(
  supabase: SupabaseClient<Database>,
  messageId: string,
): Promise<Mention[]> {
  const { data, error } = await supabase
    .from("message_mentions")
    .select("id, message_id, mentioned_membership_id")
    .eq("message_id", messageId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    messageId: row.message_id,
    mentionedMembershipId: row.mentioned_membership_id,
  }));
}

/* ------------------------------------------------------------ notifications */

export async function listNotifications(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, target_type, target_id, actor_membership_id, read_at, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    targetType: row.target_type,
    targetId: row.target_id,
    actorMembershipId: row.actor_membership_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

/**
 * Marks one notification read.
 *
 * Through the RPC, not an update: notifications has no UPDATE grant, so the
 * single writable column is written by a definer function filtered on
 * auth.uid(). Same reasoning as removeReaction's missing sibling.
 */
export async function markNotificationRead(
  supabase: SupabaseClient<Database>,
  notificationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", {
    check_notification_id: notificationId,
  });
  if (error) throw error;
}

/* -------------------------------------------------------------- attachments */

/**
 * Asks the database whether an upload is allowed, BEFORE uploading.
 *
 * Returns null when it is. The acceptance criterion is "quota exceeded fails
 * with a plain message, not a broken upload" -- so the check happens first and
 * the answer is a sentence, not a boolean. The two ceilings (this Family's
 * 100 MB, and the project's) fail for different reasons and say so
 * differently, because "your Family is out of space" is actionable and "the
 * platform is out of space" is not.
 */
export async function checkAttachmentAllowed(
  supabase: SupabaseClient<Database>,
  args: { orgId: string; byteSize: number },
): Promise<string | null> {
  const { data, error } = await supabase.rpc("check_family_storage_quota", {
    check_org_id: args.orgId,
    incoming_bytes: args.byteSize,
  });
  if (error) throw error;
  return data ?? null;
}

/**
 * Uploads an attachment and records its metadata.
 *
 * The quota is checked first and refuses with the database's own sentence. The
 * upload can still fail afterwards -- the platform enforces the 5 MB cap on the
 * bucket row too -- and that is deliberate belt and braces, not redundancy: the
 * app's check can be skipped by a future caller, and the bucket's cannot.
 */
export async function uploadAttachment(
  supabase: SupabaseClient<Database>,
  args: {
    orgId: string;
    conversationId: string;
    messageId: string;
    file: File | Blob;
    fileName: string;
    mimeType: string;
  },
): Promise<Attachment> {
  const byteSize = args.file.size;

  const refusal = await checkAttachmentAllowed(supabase, {
    orgId: args.orgId,
    byteSize,
  });
  if (refusal) throw new AttachmentRefused(refusal);

  // org_id leads so every policy and every quota sum is a prefix match on the
  // first path token, and a Family's whole footprint is one subtree.
  const storagePath = `${args.orgId}/${args.conversationId}/${crypto.randomUUID()}-${args.fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("family-attachments")
    .upload(storagePath, args.file, { contentType: args.mimeType });
  if (uploadError) throw new AttachmentRefused(uploadError.message);

  const { data, error } = await supabase
    .from("message_attachments")
    .insert({
      org_id: args.orgId,
      message_id: args.messageId,
      storage_path: storagePath,
      mime_type: args.mimeType,
      byte_size: byteSize,
    })
    .select("id, message_id, storage_path, mime_type, byte_size")
    .single();

  if (error) {
    // The metadata row is what makes the object reachable and what the delete
    // trigger reads. An orphaned object would count against the quota forever
    // with nothing pointing at it, so it goes back out.
    await supabase.storage.from("family-attachments").remove([storagePath]);
    throw error;
  }

  return {
    id: data.id,
    messageId: data.message_id,
    storagePath: data.storage_path,
    mimeType: data.mime_type,
    byteSize: Number(data.byte_size),
  };
}

export async function listAttachments(
  supabase: SupabaseClient<Database>,
  messageId: string,
): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from("message_attachments")
    .select("id, message_id, storage_path, mime_type, byte_size")
    .eq("message_id", messageId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    messageId: row.message_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
  }));
}
