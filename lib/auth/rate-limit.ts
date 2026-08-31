import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The auth rate limiter. S2: "rate limiting on every auth endpoint (sign-in,
 * code/link requests, password reset)", acceptance "the sixth rapid auth
 * attempt is refused".
 *
 * TWO BUCKETS PER ATTEMPT, WITH DIFFERENT LIMITS, AND THE DIFFERENCE MATTERS.
 * A single per-IP limit of 5 would be wrong for this product: F4milia is built
 * for groups of 8-12 who share a household or an office, and everyone behind
 * one NAT presents the same address. Five sign-ins per quarter hour for a whole
 * family is an outage, not a defence. So:
 *
 *   - per (endpoint, address): 5 per 15 minutes. This is the one the acceptance
 *     criterion names -- six rapid attempts against one account, refused -- and
 *     it is the bucket that actually stops a targeted password guess.
 *   - per (endpoint, IP): 20 per 15 minutes. Bounds a spray across many
 *     addresses from one source while leaving room for a shared address.
 *
 * Both are consumed on every attempt; either one refusing refuses the attempt.
 */
export const AUTH_RATE_LIMITS = {
  perIdentifier: { limit: 5, windowSeconds: 900 },
  perIp: { limit: 20, windowSeconds: 900 },
} as const;

/** Every auth entry point that costs something: a GoTrue call, or mail. */
export type AuthEndpoint =
  | "sign-in"
  | "sign-up"
  | "magic-link"
  | "password-reset"
  | "password-update"
  | "email-change";

/**
 * What actually reaches the database as the bucket key.
 *
 * SHA-256 of the identifier, and what that does and does not buy: it keeps
 * plaintext addresses out of ratelimit.counters and out of any statement log
 * that captures the function's arguments, so the limiter never becomes a
 * standing list of everyone who has tried to sign in. It is NOT protection
 * against an offline dictionary attack on the digests -- the address space of
 * email is guessable -- and it does not need to be: reaching the table at all
 * requires the database owner, since neither anon, authenticated nor
 * service_role holds any privilege on it.
 *
 * Lower-cased and trimmed first, so "A@b.test " and "a@b.test" share one
 * allowance rather than being two free sets of attempts.
 */
function fingerprint(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/**
 * The caller's address, as far as it can be known.
 *
 * On Vercel `x-forwarded-for` is set by the platform edge and a client cannot
 * forge it; the leftmost entry is the client. Locally `next dev` sets neither
 * header, which is why the fallback is a literal shared bucket rather than a
 * skipped check -- an unknown source must still be limited (it just shares one
 * allowance with every other unknown source, and locally that means the per-IP
 * bucket is effectively global). Failing open here would make the header the
 * limiter's off switch.
 */
async function clientAddress(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  const leftmost = forwarded?.split(",")[0]?.trim();
  return leftmost || requestHeaders.get("x-real-ip")?.trim() || "unknown-source";
}

/**
 * One bucket. Returns false when the attempt is over the limit -- and also when
 * the store cannot be reached.
 *
 * FAILS CLOSED, deliberately. The counter lives in the same Postgres the auth
 * flow needs anyway, so "the limiter is down but sign-in is up" is close to
 * impossible; the reachable failure is a misconfigured service-role key, and an
 * auth endpoint with silently no rate limiting is a worse outcome than an auth
 * endpoint that is plainly refusing everyone. A refusal is visible and gets
 * fixed; a missing limit is invisible until it is exploited.
 */
async function consume(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/**
 * Records one attempt against `endpoint` and says whether it may proceed.
 *
 * `identifier` is the address being acted on, or the signed-in user's id where
 * there is no address in the form (password update, email change). Omit it only
 * where there is genuinely nothing to key on; the per-IP bucket still applies.
 *
 * Call sites check this AFTER their own empty-field validation and BEFORE the
 * GoTrue call. That ordering is deliberate: a person's own typo should not burn
 * their allowance, and the expensive, abusable thing is the GoTrue call, not the
 * form parse.
 */
export async function withinAuthRateLimit(
  endpoint: AuthEndpoint,
  identifier?: string,
): Promise<boolean> {
  const address = await clientAddress();

  // Both are consumed on every attempt, so Promise.all rather than a
  // short-circuit: a request refused by the address bucket must still count
  // against the source's allowance, or a spray would be free after its first
  // refusal.
  const outcomes = await Promise.all([
    consume(
      `${endpoint}:ip:${fingerprint(address)}`,
      AUTH_RATE_LIMITS.perIp.limit,
      AUTH_RATE_LIMITS.perIp.windowSeconds,
    ),
    ...(identifier
      ? [
          consume(
            `${endpoint}:id:${fingerprint(identifier)}`,
            AUTH_RATE_LIMITS.perIdentifier.limit,
            AUTH_RATE_LIMITS.perIdentifier.windowSeconds,
          ),
        ]
      : []),
  ]);

  return outcomes.every(Boolean);
}
