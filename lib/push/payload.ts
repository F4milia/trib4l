/**
 * Builds the body of a push notification.
 *
 * THIS FILE IS INVARIANT 3, AND IT IS THE ONLY PLACE IT CAN BE ENFORCED.
 *
 *   "NO Family content in any outbound message. Emails and pushes name the
 *    event, never the content -- no Table entry text, no message bodies.
 *    Assume the inbox may be shared."
 *
 * A push arrives on a lock screen. The device may be someone else's, may be
 * face-up on a table, may be mirrored to a car. So the notification says that
 * something happened and who caused it is not even named -- it says the EVENT.
 *
 * The design that makes this hold is that the builder takes a NOTIFICATION
 * TYPE and ids, and has no parameter that could carry content. There is no
 * `body` argument to misuse. A caller who wants to interpolate a message would
 * have to change this file, which is a reviewable diff, rather than pass a
 * different string to an existing function, which is not.
 */

import type { Database } from "../supabase/database.types";

export type NotificationType = Database["public"]["Enums"]["notification_type"];

export type PushPayload = {
  title: string;
  body: string;
  /** Where clicking it should land. Ids only -- the page re-reads through RLS. */
  url: string;
  tag: string;
};

/**
 * One line per type, all of them content-free.
 *
 * Deliberately not parameterised by a name: "Ana mentioned you" tells a
 * bystander who is in this person's Family. "You were mentioned" does not, and
 * the app itself is one tap away for anyone entitled to the detail.
 */
const TITLES: Record<NotificationType, string> = {
  mention: "You were mentioned",
  family_night_digest: "Family night summary",
  vow_notification: "A Vow needs you",
};

export function buildPushPayload(args: {
  type: NotificationType;
  orgSlug: string;
  targetId: string;
}): PushPayload {
  return {
    title: TITLES[args.type],
    // Constant per type. There is no argument that could carry Family content,
    // which is what makes the invariant structural rather than a convention.
    body: "Open F4milia to see it.",
    url: `/o/${args.orgSlug}/messages?n=${args.targetId}`,
    // Collapses repeats on the device, per Family and per type, so twenty
    // mentions do not become twenty lock-screen rows.
    tag: `${args.orgSlug}:${args.type}`,
  };
}
