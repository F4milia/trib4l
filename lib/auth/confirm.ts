import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * The two pure decisions behind app/auth/confirm/route.ts, lifted out so they
 * can be tested without a request, a session, or a running GoTrue.
 *
 * Both are closed sets rather than validation-by-shape. CLAUDE.md's
 * 2026-08-28 learned constraint ("replace the whitespace heuristic with a
 * closed key set") is the same lesson: a heuristic over a hostile input is a
 * hole with a plausible shape.
 */

/**
 * The email OTP types this route will verify. `EmailOtpType` widens to
 * `string & {}`, so an unchecked cast of `searchParams.get("type")` would hand
 * an attacker-chosen string straight to verifyOtp.
 *
 * Only the types a template in this repo can actually produce are listed.
 * Later S1 PRs add their own: magiclink (PR 3), recovery (PR 5), email_change
 * (PR 6). Listing a type before its template exists would be an untested door.
 */
export const CONFIRMABLE_TYPES = ["email", "signup"] as const;

export function confirmableType(raw: string | null | undefined): EmailOtpType | null {
  return (CONFIRMABLE_TYPES as readonly string[]).includes(raw ?? "")
    ? (raw as EmailOtpType)
    : null;
}

/**
 * Where to land after a successful verification. The value arrives in a URL
 * the user clicked from their inbox, so it is attacker-controllable: a
 * confirmation link is exactly the kind of high-trust link an open redirect
 * gets laundered through.
 *
 * Same-origin, path-only, or nothing. Note that browsers normalise a
 * backslash to a forward slash in the authority position, so `/\evil.example`
 * is protocol-relative in practice even though it does not start with `//`.
 */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  // A CR or LF would be header injection in the Location response; other
  // control characters have no business in a path either.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (/^\/[/\\]/.test(raw)) return fallback;
  return raw;
}
