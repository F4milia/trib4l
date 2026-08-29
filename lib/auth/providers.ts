/**
 * The OAuth providers S1 asks for, and the rule for when each one is offered.
 *
 * WHY PRESENCE OF THE CLIENT ID IS THE TEST
 * Measured on 2026-08-30, not assumed: `[auth.external.<p>] enabled = true`
 * with an empty `client_id` makes the Supabase CLI refuse to parse
 * config.toml at all -- `supabase start` and even `supabase status` fail with
 * ProjectConfigParseError. With a non-empty client_id it parses, even when the
 * secret is unset. So "a client id exists in the environment" is exactly the
 * condition under which the provider CAN be enabled, which makes it the honest
 * thing to gate the button on. A button for a provider the project has not
 * configured is a button that sends people to an error.
 *
 * The client id is public by design (it ships in every OAuth authorize URL);
 * only the secret is sensitive, and the secret is read by the Supabase
 * container, never by this app.
 *
 * IDENTITY LINKING -- S1's named edge case
 * When a provider asserts a verified email that already belongs to an account,
 * GoTrue links the new identity to that SAME user rather than creating a
 * second one, so "sign up with Google using an existing password account's
 * address" yields one user, one profiles row, one membership. That is GoTrue's
 * behaviour, not something this repo configures, and it is NOT verified here:
 * no Google or Apple credentials exist in this project, so the round trip
 * cannot be executed locally. It is on the register as the edge case a human
 * confirms by hand in staging once credentials land. `enable_manual_linking`
 * stays false -- linking is the provider-asserted case above, never an
 * endpoint a session can call.
 */

export const OAUTH_PROVIDERS = [
  { id: "google", clientIdVar: "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID" },
  { id: "apple", clientIdVar: "SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID" },
] as const;

export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number]["id"];

/** A closed set, for the same reason lib/auth/confirm.ts uses one: the value
 *  arrives from a form field and is handed to the auth client. */
export function oauthProvider(raw: string | null | undefined): OAuthProviderId | null {
  const found = OAUTH_PROVIDERS.find((p) => p.id === raw);
  return found ? found.id : null;
}

/**
 * Server-side only -- every caller is a Server Component or Server Action.
 * Reads nothing secret, but keeping it off the client also keeps the set of
 * configured providers from being a thing the browser can be told to disagree
 * with.
 */
export function configuredProviders(
  env: Record<string, string | undefined> = process.env,
): readonly OAuthProviderId[] {
  return OAUTH_PROVIDERS.filter((p) => (env[p.clientIdVar] ?? "").trim() !== "").map((p) => p.id);
}

/**
 * Where a provider sends the person back to. Explicit configuration wins: on
 * staging and production this must be set, or the value falls back to the
 * request's own Origin, which the caller controls.
 *
 * That fallback is bounded rather than dangerous -- Supabase refuses any
 * redirectTo outside site_url plus additional_redirect_urls, so a forged
 * Origin fails the allow-list instead of redirecting anyone. It exists so
 * local development works with no extra setup.
 */
export function callbackUrl(
  origin: string | null,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const base = (env.NEXT_PUBLIC_SITE_URL || origin || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) return null;
  return `${base}/auth/callback`;
}
