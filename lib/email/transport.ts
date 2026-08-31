import { Resend } from "resend";
import { readEmailConfig, type EmailConfig } from "./config";

/**
 * The one place mail leaves this application.
 *
 * CLAUDE.md invariant 3 is the constraint that shapes this file: "NO Family
 * content in any outbound message. Emails and pushes name the event, never the
 * content." That is enforced upstream, in the template layer, by giving the
 * render functions no content parameter to pass -- there is nothing here to
 * strip, because nothing carrying content ever reaches here. This module's job
 * is the other half: making sure a message that is safe to send only goes out
 * from an environment that is meant to send it.
 */

export type OutboundMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Coarse label for logs and Resend tags, e.g. "family_invite". Never content. */
  kind: string;
};

export type SendOutcome =
  | { delivered: true; mode: "live" | "redirect"; id: string | null; to: string }
  | { delivered: false; mode: "dry-run"; reason: "dry-run"; to: string }
  | { delivered: false; mode: "live" | "redirect"; reason: "suppressed-by-preference"; to: string };

export class EmailSendError extends Error {
  constructor(message: string, readonly kind: string) {
    // The message is Resend's own error, never the mail body -- Sentry
    // receives errors only (invariant 12), and a body in an exception message
    // is a body in Sentry.
    super(message);
    this.name = "EmailSendError";
  }
}

let cachedClient: Resend | null = null;

function resendClient(apiKey: string): Resend {
  if (!cachedClient) cachedClient = new Resend(apiKey);
  return cachedClient;
}

/** Test seam. */
export function resetEmailClientForTests() {
  cachedClient = null;
}

/**
 * Where a message actually goes, given the mode. In `redirect` every recipient
 * collapses onto the staging inbox -- that is what makes "delivers in staging"
 * and "staging never sends real mail" both true at once.
 */
export function resolveRecipient(config: EmailConfig, intended: string): string {
  return config.mode === "redirect" ? config.testInbox! : intended;
}

export async function sendEmail(
  message: OutboundMessage,
  options: { config?: EmailConfig; send?: typeof deliverViaResend } = {},
): Promise<SendOutcome> {
  const config = options.config ?? readEmailConfig();

  if (config.mode === "dry-run") {
    // Not an error and not silent-by-accident: dry-run is the default, so an
    // unconfigured environment reports what it would have done rather than
    // either sending or throwing.
    return { delivered: false, mode: "dry-run", reason: "dry-run", to: message.to };
  }

  const actualRecipient = resolveRecipient(config, message.to);
  const deliver = options.send ?? deliverViaResend;

  const id = await deliver(config, {
    ...message,
    to: actualRecipient,
    // In redirect mode the staging inbox holds every member's mail at once, so
    // the tester needs to know which one they are looking at. A header rather
    // than a subject prefix: the subject is one of the things under test and
    // must render exactly as a member would see it.
    intendedRecipient: config.mode === "redirect" ? message.to : null,
  });

  return { delivered: true, mode: config.mode, id, to: actualRecipient };
}

type DeliveryPayload = OutboundMessage & { intendedRecipient: string | null };

async function deliverViaResend(config: EmailConfig, payload: DeliveryPayload): Promise<string | null> {
  const { data, error } = await resendClient(config.apiKey!).emails.send({
    from: config.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    headers: payload.intendedRecipient
      ? { "X-F4milia-Intended-Recipient": payload.intendedRecipient }
      : undefined,
    tags: [{ name: "kind", value: payload.kind }],
  });

  if (error) throw new EmailSendError(error.message, payload.kind);
  return data?.id ?? null;
}
