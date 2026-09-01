import { Inngest } from "inngest";

/**
 * The Inngest client. Scaffolding for N1 (Wave 4), which delivers calendar
 * reminders and notification digests through it.
 *
 * BOOTS WITH NO KEYS, AND SENDS NOTHING. Same rule as lib/push: an
 * unconfigured integration is a disabled feature, not a boot failure. CI has
 * no Inngest account, and a client that threw on construction would take the
 * whole app down in every environment that has not been wired up yet --
 * including a developer's first `npm run dev`.
 *
 * Inngest's own client does not throw without keys; what it does instead is
 * silently accept sends that go nowhere. That is worse, so `isInngestConfigured`
 * exists to make the state legible, and every caller is expected to check it
 * rather than assume a send happened.
 */

/**
 * The event contract, as a plain type.
 *
 * INVARIANT 3 APPLIES TO EVERY PAYLOAD HERE. An Inngest event leaves this
 * process and is STORED BY A THIRD PARTY, so it carries ids and never Family
 * content -- no Table entry text, no message bodies, no display names. The
 * handler re-reads through RLS, which is what makes that possible: an event
 * carrying only ids is useless to anyone who cannot already read the rows.
 *
 * NOT WIRED INTO THE CLIENT'S GENERICS YET, deliberately. Inngest v4 replaced
 * `EventSchemas().fromRecord<T>()` with `eventType` / `staticSchema`, and
 * guessing at the new shape would leave N1 with plumbing that typechecks and
 * expresses the wrong contract. N1 adopts the typed form on purpose; this type
 * is the contract it should encode.
 */
export type NotificationCreatedEvent = {
  name: "family/notification.created";
  data: {
    notificationId: string;
    orgId: string;
    membershipId: string;
  };
};

export const inngest = new Inngest({
  id: "f4milia",
  // Keys are absent locally and in CI. Inngest reads INNGEST_EVENT_KEY from the
  // environment itself; passing it explicitly here would only duplicate that.
});

/**
 * Whether a send would actually reach Inngest.
 *
 * Checked rather than assumed, because the failure mode without it is silent:
 * an unconfigured client accepts `inngest.send()` and the event simply never
 * arrives, which looks identical to a function that did not fire.
 */
export function isInngestConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean((env.INNGEST_EVENT_KEY ?? "").trim());
}
