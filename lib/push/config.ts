/**
 * VAPID configuration, read from the environment.
 *
 * UNSET IS A SUPPORTED STATE AND MUST NEVER THROW AT IMPORT. Web push is
 * additive: nothing in the product depends on it, CI has no keys, and a
 * developer running the app locally has none either. A module that threw here
 * would make every test in the process fail with a stack trace pointing at a
 * missing secret rather than at anything the test was about.
 *
 * So the shape is "configured or not", decided once, and every caller has to
 * handle not-configured. That is deliberate: it makes the unconfigured path a
 * thing the type system asks about, rather than a runtime surprise in staging.
 */

export type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type PushConfigResult =
  | { configured: true; config: PushConfig }
  | { configured: false; reason: string };

type Env = Record<string, string | undefined>;

export function readPushConfig(env: Env = process.env): PushConfigResult {
  const publicKey = (env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (env.VAPID_SUBJECT ?? "").trim();

  const missing = [
    publicKey ? null : "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    privateKey ? null : "VAPID_PRIVATE_KEY",
    subject ? null : "VAPID_SUBJECT",
  ].filter(Boolean);

  if (missing.length > 0) {
    return { configured: false, reason: `web push is not configured: ${missing.join(", ")} unset` };
  }

  // A malformed subject is worth catching here rather than at send time,
  // because push services reject it per-send and the failure looks like a
  // rejected subscription.
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    return {
      configured: false,
      reason: "web push is not configured: VAPID_SUBJECT must be a mailto: or https: URL",
    };
  }

  return { configured: true, config: { publicKey, privateKey, subject } };
}
