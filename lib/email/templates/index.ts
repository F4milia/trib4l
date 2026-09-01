import { copy } from "../../copy";
import { renderEmailHtml, renderEmailText, type EmailLayoutInput } from "../layout";

/**
 * The four templates Ferenz 12.2 names: Family invite, Family Night digest,
 * Vow notification, password reset.
 *
 * HOW INVARIANT 3 IS ENFORCED HERE, AND IT IS WORTH READING BEFORE ADDING A
 * FIFTH TEMPLATE.
 *
 * CLAUDE.md: "NO Family content in any outbound message. Emails and pushes
 * name the event, never the content. Assume the inbox may be shared."
 *
 * Not enforced by scrubbing the output -- a scrubber means content already
 * reached the mailer and we are hoping to catch it. Enforced by the parameter
 * types: every render function below takes only URLs, integers, and closed
 * unions of literals. There is no free-text parameter anywhere in this file,
 * so a caller holding a Table entry has nothing to pass it to. All prose comes
 * from the copy deck, fixed at build time.
 *
 * This includes Family and member NAMES. The S1 prompt says it outright --
 * "Verification emails carry no Family names or content" -- and an invitation
 * is read in the same inbox as a verification mail. Which Family invited you,
 * and who sent it, live behind the link, where only the holder of the token
 * sees them. templates.test.ts asserts the no-free-text property against the
 * source of this file, so a future template cannot quietly reintroduce one.
 */

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  /** Fixed label for logs and Resend tags. Never content. */
  kind: string;
};

export type VowEvent = "assigned" | "due_soon" | "completed";

function render(kind: string, subject: string, layout: EmailLayoutInput): RenderedEmail {
  return {
    kind,
    subject,
    html: renderEmailHtml(layout),
    text: renderEmailText(layout),
  };
}

export function renderFamilyInvite(args: { acceptUrl: string }): RenderedEmail {
  const c = copy.email.invite;
  return render("family_invite", c.subject, {
    eyebrow: c.eyebrow,
    heading: c.heading,
    body: [...c.body],
    action: { label: c.action, url: args.acceptUrl },
    footnote: c.footnote,
  });
}

export function renderFamilyNightDigest(args: { digestUrl: string }): RenderedEmail {
  const c = copy.email.familyNight;
  return render("family_night_digest", c.subject, {
    eyebrow: c.eyebrow,
    heading: c.heading,
    body: [...c.body],
    action: { label: c.action, url: args.digestUrl },
    footnote: c.footnote,
  });
}

export function renderVowNotification(args: { vowUrl: string; event: VowEvent }): RenderedEmail {
  const c = copy.email.vow;
  return render("vow_notification", c.subject[args.event], {
    eyebrow: c.eyebrow,
    heading: c.heading[args.event],
    body: [...c.body[args.event]],
    action: { label: c.action, url: args.vowUrl },
    footnote: c.footnote,
  });
}

/**
 * Rendered here for parity with the other three, and NOT wired to Supabase
 * Auth by this session. Auth sends its own recovery mail from the Auth
 * service, configured in supabase/config.toml under [auth.email.smtp] --
 * Stream A's surface (S1 built the reset flow, S2 is hardening it), so
 * standing workflow rule 4 says stop rather than edit it. See
 * docs/email-sending-domain.md.
 */
export function renderPasswordReset(args: { resetUrl: string }): RenderedEmail {
  const c = copy.email.passwordReset;
  return render("password_reset", c.subject, {
    eyebrow: c.eyebrow,
    heading: c.heading,
    body: [...c.body],
    action: { label: c.action, url: args.resetUrl },
    footnote: c.footnote,
  });
}
