/**
 * The OAuth providers S1 asks for, and the rule for when each one is offered.
 *
 * WHY PRESENCE OF THE CLIENT ID IS THE TEST
 * Measured 2026-08-30, then CORRECTED 2026-08-31 after testing the case the
 * first measurement had only inferred:
 *
 *  - `enabled = true` with a LITERAL empty client_id (`client_id = ""`) makes
 *    the CLI refuse to parse config.toml -- `supabase start` and `status` both
 *    fail with ProjectConfigParseError.
 *  - `enabled = true` with `client_id = "env(SOMETHING_UNSET)"` parses fine
 *    AND the stack boots, auth container healthy. Verified with a variable
 *    guaranteed not to exist.
 *
 * The earlier note here claimed the second case broke every local stack and
 * all three CI jobs. It does not. The real failure is quieter and worse: the
 * provider is enabled with no credentials, so the config is valid, CI is
 * green, and Google sign-in fails only when somebody clicks the button.
 *
 * That is what this gate is for. A provider whose client id is absent from the
 * environment gets no button, so the broken path is unreachable rather than
 * merely untested.
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
export function siteOrigin(
  origin: string | null,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const base = (env.NEXT_PUBLIC_SITE_URL || origin || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(base) ? base : null;
}

export function callbackUrl(
  origin: string | null,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const base = siteOrigin(origin, env);
  return base && `${base}/auth/callback`;
}

/**
 * Where an emailed auth link comes back to. The FULL route, not just an origin.
 *
 * Passed to Supabase as `emailRedirectTo`, which the templates render as
 * `{{ .RedirectTo }}`. That indirection is the point: `{{ .SiteURL }}` is ONE
 * fixed value per Supabase project, so a template hardcoding it sends every
 * preview deployment's link to production.
 *
 * WHY THE FULL ROUTE, measured 2026-08-31 against a real GoTrue:
 *
 *  - A redirect of `http://localhost:3000/auth/confirm` is honoured -- it
 *    matches the `http://localhost:3000/**` entry in additional_redirect_urls.
 *  - A BARE ORIGIN (`http://localhost:3000`) is NOT. It fails the allow-list
 *    and GoTrue silently substitutes the project's SiteURL instead, with no
 *    error to the caller. The wildcard entry does not match a pathless URL.
 *
 * So the route cannot live in the template: the template would then be
 * appending a path to a value that is sometimes an origin and sometimes not.
 *
 * The consequence to know about: when no redirect is supplied at all, GoTrue
 * substitutes SiteURL, a bare origin, and the link loses its path. There is no
 * template-side guard for that -- `{{ .RedirectTo }}` is never empty, so a
 * `{{ if }}` fallback can never fire. The safety net is instead that every
 * emailed call site supplies one, which tests/auth-redirect.test.ts asserts
 * for all four of them.
 */
export function confirmUrl(
  origin: string | null,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const base = siteOrigin(origin, env);
  return base && `${base}/auth/confirm`;
}
