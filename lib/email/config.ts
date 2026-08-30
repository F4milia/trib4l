/**
 * Email configuration, resolved from the environment and validated before
 * anything is sent.
 *
 * Two things this file exists to make impossible:
 *
 * 1. Sending real mail from an environment that should not. E1's acceptance
 *    criterion is "each template renders and delivers in staging (test mode --
 *    staging never sends real mail)". The default when nothing is configured
 *    is therefore `dry-run`, not `live`: an unconfigured environment is silent
 *    rather than surprising. Production has to say `live` out loud.
 *
 * 2. Sending from a domain that has no SPF/DKIM. Resend will accept a From
 *    address on an unverified domain and the mail will land in spam or be
 *    rejected downstream, which looks like "email is flaky" rather than like
 *    a misconfiguration. `live` mode refuses to start unless the From
 *    address's domain is the domain that was actually verified.
 *    See docs/email-sending-domain.md.
 */

export type EmailDeliveryMode = "live" | "redirect" | "dry-run";

export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigError";
  }
}

export type EmailConfig = {
  mode: EmailDeliveryMode;
  /** Full From header value, e.g. `F4milia <hello@mail.f4milia.com>`. */
  from: string;
  /** The domain SPF/DKIM were verified for. */
  sendingDomain: string;
  /** Where `redirect` mode sends everything instead of the real recipient. */
  testInbox: string | null;
  apiKey: string | null;
};

/** `F4milia <hello@mail.example.com>` and `hello@mail.example.com` both yield the domain. */
export function domainOf(address: string): string | null {
  const match = address.match(/<([^>]+)>\s*$/);
  const bare = (match ? match[1] : address).trim();
  const at = bare.lastIndexOf("@");
  if (at <= 0 || at === bare.length - 1) return null;
  return bare.slice(at + 1).toLowerCase();
}

/**
 * Just the shape this module reads. Narrower than NodeJS.ProcessEnv on
 * purpose: process.env satisfies it, and a test can hand over a plain object
 * without asserting its way past a required NODE_ENV it does not care about.
 */
export type EmailEnvSource = Record<string, string | undefined>;

function parseMode(raw: string | undefined): EmailDeliveryMode {
  // Unset means dry-run. Deliberately not "guess from NODE_ENV": a preview
  // deployment and production are both NODE_ENV=production, and the failure
  // that guess produces is real mail to real members from a branch build.
  if (raw === undefined || raw === "") return "dry-run";
  if (raw === "live" || raw === "redirect" || raw === "dry-run") return raw;
  throw new EmailConfigError(
    `EMAIL_DELIVERY_MODE must be live, redirect or dry-run -- got "${raw}"`,
  );
}

export function readEmailConfig(env: EmailEnvSource = process.env): EmailConfig {
  const mode = parseMode(env.EMAIL_DELIVERY_MODE);
  const from = (env.EMAIL_FROM_ADDRESS ?? "").trim();
  const sendingDomain = (env.EMAIL_SENDING_DOMAIN ?? "").trim().toLowerCase();
  const testInbox = (env.EMAIL_TEST_INBOX ?? "").trim() || null;
  const apiKey = (env.RESEND_API_KEY ?? "").trim() || null;

  if (mode !== "dry-run") {
    if (!from) {
      throw new EmailConfigError("EMAIL_FROM_ADDRESS is required unless EMAIL_DELIVERY_MODE is dry-run");
    }
    if (!apiKey) {
      throw new EmailConfigError("RESEND_API_KEY is required unless EMAIL_DELIVERY_MODE is dry-run");
    }
  }

  if (mode === "live") {
    if (!sendingDomain) {
      throw new EmailConfigError(
        "EMAIL_SENDING_DOMAIN is required in live mode -- it names the domain SPF/DKIM were verified for",
      );
    }
    const fromDomain = domainOf(from);
    if (fromDomain !== sendingDomain) {
      // Not a warning. A From address outside the verified domain fails SPF
      // and DKIM alignment, and the resulting deliverability problem is
      // indistinguishable from "our email is unreliable".
      throw new EmailConfigError(
        `EMAIL_FROM_ADDRESS is on "${fromDomain ?? "an unparseable domain"}" but EMAIL_SENDING_DOMAIN is "${sendingDomain}" -- SPF/DKIM would not align`,
      );
    }
  }

  if (mode === "redirect" && !testInbox) {
    throw new EmailConfigError(
      "EMAIL_TEST_INBOX is required in redirect mode -- it is where mail goes instead of the real member",
    );
  }

  return { mode, from, sendingDomain, testInbox, apiKey };
}
