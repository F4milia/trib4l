import { inngest } from "./client";

/**
 * One function, and it deliberately does nothing yet.
 *
 * It exists so the route below has something to serve and so the wiring is
 * proven end to end before N1 depends on it -- a route that serves zero
 * functions returns 200 and tells you nothing about whether the handshake
 * works.
 *
 * N1 replaces the body with the real delivery: read the notification by id
 * THROUGH RLS as the recipient, build a payload with lib/push, send to every
 * unexpired subscription for that membership.
 */
// Inngest v4 takes two arguments, with the trigger inside the options object --
// the three-argument form from v3 is a compile error, not a deprecation warning.
export const onNotificationCreated = inngest.createFunction(
  {
    id: "notification-created",
    triggers: [{ event: "family/notification.created" }],
  },
  async ({ event, step }: { event: { data: { notificationId: string } }; step: { run: (id: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    // Ids only. The event carries no Family content (see client.ts), so the
    // handler has nothing to leak and must re-read to do anything useful --
    // which is the point: the re-read goes through policy.
    await step.run("acknowledge", async () => ({
      notificationId: event.data.notificationId,
    }));

    return { delivered: false, reason: "N1 has not implemented delivery yet" };
  },
);

export const functions = [onNotificationCreated];
