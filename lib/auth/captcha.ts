/**
 * The captcha token's trip from the form to GoTrue.
 *
 * WHY GOTRUE VERIFIES IT AND NOT THIS APP. The obvious shape -- POST the token
 * to Cloudflare's siteverify inside the server action, then call GoTrue -- is
 * the wrong one here, because a server action is not the only way to reach
 * signup. The anon key is public by design and sits in the client bundle, so
 * anybody can POST /auth/v1/signup directly and never touch app/actions/auth.ts
 * at all. A check in the action would guard the door a bot has no reason to use.
 *
 * So the token is forwarded, and `[auth.captcha]` in supabase/config.toml is
 * what makes it mandatory (PR 4). The app's job is only to obtain a token and
 * pass it along.
 */
export const TURNSTILE_FIELD = "cf-turnstile-response";

/**
 * The token Turnstile's script put in the form, or undefined.
 *
 * Undefined rather than an empty string on purpose: supabase-js omits the
 * `gotrue_meta_security` block entirely when the option is undefined, whereas an
 * empty string sends a captcha token GoTrue will then reject as invalid. Those
 * are different failures, and the second one is misleading -- "your captcha was
 * wrong" for a widget that never loaded.
 *
 * Absent is a real state, not an error to raise here: the widget renders only
 * where a site key is configured, so local development and CI have no token to
 * give. With captcha off that is fine (measured 2026-09-01: GoTrue returns 200
 * for an unverified token when captcha is disabled, and ignores its absence);
 * with captcha on, GoTrue refuses, which is precisely the enforcement wanted.
 */
export function captchaToken(formData: FormData): string | undefined {
  const token = String(formData.get(TURNSTILE_FIELD) ?? "").trim();
  return token || undefined;
}

/** Whether a widget can render at all. Mirrors configuredProviders()'s pattern:
 *  offer nothing rather than something broken. */
export function captchaConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}
