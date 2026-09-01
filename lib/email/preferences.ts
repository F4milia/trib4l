import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

export type NotificationType = Database["public"]["Enums"]["notification_type"];
export type NotificationChannel = Database["public"]["Enums"]["notification_channel"];

export type Recipient = {
  profileId: string;
  email: string;
};

export type PreferenceFilterResult = {
  /** Members who have not muted this type in this Family. */
  send: Recipient[];
  /** Members who have muted it. Kept for the caller's own logging -- counts, never content. */
  muted: Recipient[];
  /**
   * Members whose preference could not be read. They are NOT in `send`.
   * Suppressed rather than sent to: mailing someone who muted you is worse
   * than missing one digest, and a preference read that failed is not
   * evidence of consent.
   */
  unresolved: { recipient: Recipient; reason: string }[];
};

/**
 * Reads the effective preference for one member in one Family.
 *
 * Goes through public.notification_preference_enabled() rather than selecting
 * from the table, for two reasons. The absence-is-default rule lives in that
 * function, so no sender reimplements "no row means yes" -- getting that
 * backwards fails silently by NOT sending, which is the failure nobody
 * notices. And service_role holds EXECUTE on the function but no DML on the
 * table, so the send path can answer one question about one member without
 * being able to enumerate who muted what.
 *
 * The client must be a service-role client: the function is not granted to
 * authenticated, deliberately (a mute is private to whoever set it).
 */
export async function isNotificationEnabled(
  client: SupabaseClient<Database>,
  args: {
    orgId: string;
    profileId: string;
    type: NotificationType;
    channel?: NotificationChannel;
  },
): Promise<boolean> {
  const { data, error } = await client.rpc("notification_preference_enabled", {
    p_org_id: args.orgId,
    p_profile_id: args.profileId,
    p_type: args.type,
    p_channel: args.channel ?? "email",
  });

  if (error) throw new Error(`Could not read notification preference: ${error.message}`);
  return data === true;
}

/**
 * Splits a Family's recipients into who should receive this notification and
 * who should not.
 *
 * Per-recipient rather than all-or-nothing on purpose: a digest going to
 * twelve people should not be abandoned because one preference read failed.
 * CLAUDE.md invariant 3 -- "Notification preferences are per-Family, never one
 * global mute" -- is why orgId is a required argument here and not derivable
 * from the recipient.
 */
export async function filterByPreference(
  client: SupabaseClient<Database>,
  args: { orgId: string; type: NotificationType; channel?: NotificationChannel },
  recipients: Recipient[],
): Promise<PreferenceFilterResult> {
  const result: PreferenceFilterResult = { send: [], muted: [], unresolved: [] };

  for (const recipient of recipients) {
    try {
      const enabled = await isNotificationEnabled(client, {
        orgId: args.orgId,
        profileId: recipient.profileId,
        type: args.type,
        channel: args.channel,
      });
      if (enabled) result.send.push(recipient);
      else result.muted.push(recipient);
    } catch (error) {
      result.unresolved.push({
        recipient,
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return result;
}
