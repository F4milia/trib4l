import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** Matches supabase/seed.sql; mirrors tests/isolation/helpers.ts. */
export const USERS = {
  alice: { email: "alice@f4milia.test", password: "password123" }, // member: caregiver-circle
  bob: { email: "bob@f4milia.test", password: "password123" }, // organizer: caregiver-circle
  carol: { email: "carol@f4milia.test", password: "password123" }, // org_owner: founder-collective
  dave: { email: "dave@f4milia.test", password: "password123" }, // member: wellness-guild
  erin: { email: "erin@f4milia.test", password: "password123" }, // platform_staff, no org membership
} as const;

export const ORG = {
  caregiverCircle: "caregiver-circle",
  founderCollective: "founder-collective",
  wellnessGuild: "wellness-guild",
} as const;

/**
 * Seeded org ids, mirroring tests/isolation/helpers.ts. Needed because
 * `service_role` has SELECT on `memberships` but **not** on `organizations` --
 * grants in this repo are least-privilege per migration, so the usual
 * "service role reads everything" assumption is false here and an embedded
 * join to organizations fails with "permission denied".
 */
export const ORG_IDS: Record<string, string> = {
  [ORG.caregiverCircle]: "00000000-0000-0000-0000-00000000000a",
  [ORG.founderCollective]: "00000000-0000-0000-0000-00000000000b",
  [ORG.wellnessGuild]: "00000000-0000-0000-0000-00000000000c",
};

/**
 * Signs in through the real form. Next.js 16 Server Actions reject a POST with
 * no Origin header, so driving the actual form is the only honest way to do
 * this -- see docs/SESSION-LOG.md.
 */
/**
 * Waits for Turnstile to put a token in the form (S2).
 *
 * Not a workaround for a slow test -- it is what a human's typing time supplies
 * for free. Measured in this browser on 2026-09-01: the token appears 2.7
 * seconds after /login loads, while these specs fill both fields and submit in
 * milliseconds. Submitting first is a real failure (GoTrue answers 400
 * captcha_failed), so waiting is the honest fix rather than a relaxed
 * assertion.
 *
 * A no-op where no site key is configured: no widget renders, so there is no
 * input to wait for and nothing to wait on.
 */
async function waitForCaptcha(page: Page) {
  if ((await page.locator(".cf-turnstile").count()) === 0) return;
  await expect
    .poll(
      async () =>
        (await page.locator('input[name="cf-turnstile-response"]').inputValue().catch(() => ""))
          .length,
      { timeout: 30_000, intervals: [100] },
    )
    .toBeGreaterThan(0);
}

export async function signIn(page: Page, user: keyof typeof USERS) {
  await page.goto("/login");
  await page.fill("#email", USERS[user].email);
  await page.fill("#password", USERS[user].password);
  await waitForCaptcha(page);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 }),
    page.click('button[type="submit"]'),
  ]);
  /**
   * Deliberately "not /login" rather than "is /": S2's two-factor gate sends a
   * staff account with no authenticator to /settings/security instead of home,
   * and that is still a completed sign-in. A stricter assertion here would fail
   * for exactly the account the gate exists for.
   */
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Reads a seeded user's actual role in an org, so a spec can assert the correct
 * expectation instead of assuming seed state.
 *
 * Needed because seeded roles are not stable within a run:
 * tests/isolation/invitations.test.ts durably promotes alice to organizer in
 * caregiver-circle. A spec that hardcodes "alice is a member" passes or fails
 * depending on what ran before it -- and narrowing the spec to avoid that
 * removes real coverage, which is worse.
 *
 * Local-dev demo keys, never valid against a hosted project -- the same values
 * tests/isolation/helpers.ts commits for the same reason.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

/** Only 127.0.0.1 and localhost count as the local stack. */
const IS_LOCAL_STACK = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPABASE_URL);

/**
 * The committed fallbacks are the published local-dev demo keys and are only
 * ever valid against a local stack. If NEXT_PUBLIC_SUPABASE_URL points anywhere
 * else, refuse to fall back: silently using a demo key against a hosted project
 * produces confusing failures at best, and invites someone to "fix" it by
 * pasting a real service-role key into a committed file at worst.
 */
function keyFor(name: "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY", localFallback: string): string {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  if (!IS_LOCAL_STACK) {
    throw new Error(
      `${name} must be set explicitly when NEXT_PUBLIC_SUPABASE_URL is not the local stack ` +
        `(got ${SUPABASE_URL}). The fallback in tests/e2e/helpers.ts is a local-dev demo key ` +
        `and must never be used against a hosted project.`,
    );
  }
  return localFallback;
}

const SUPABASE_ANON_KEY = keyFor(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
);
const SUPABASE_SERVICE_ROLE_KEY = keyFor(
  "SUPABASE_SERVICE_ROLE_KEY",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
);

/**
 * Seeded user ids, for the admin-API calls below. Mirrors supabase/seed.sql.
 */
export const USER_IDS: Record<string, string> = {
  alice: "00000000-0000-0000-0000-0000000000a1",
  bob: "00000000-0000-0000-0000-0000000000a2",
  carol: "00000000-0000-0000-0000-0000000000a3",
  dave: "00000000-0000-0000-0000-0000000000a4",
  erin: "00000000-0000-0000-0000-0000000000a5",
  frank: "00000000-0000-0000-0000-0000000000a6",
};

/**
 * Removes every MFA factor from a seeded account, so a spec that depends on
 * "this account has no authenticator" is not at the mercy of what ran before it.
 *
 * WHY IT IS NEEDED. tests/isolation/platform-admin.test.ts calls elevateToAal2()
 * on erin and frank, which enrols and verifies a real TOTP factor and leaves it
 * behind. In CI that is invisible -- the browser job runs its own `supabase db
 * reset` and never runs the isolation suite -- but locally both suites share one
 * database, so the staff-gate spec saw erin sent to /auth/verify instead of to
 * enrolment. "Passes in CI, fails on your machine" is a worse failure than
 * either, so the precondition is now established rather than assumed.
 *
 * Through the ADMIN API, not the database: service_role has no privilege on
 * platform_staff or on the auth schema (grants here are least-privilege per
 * migration -- CLAUDE.md, 2026-08-29), while admin.getUserById returns the
 * factor list and admin.mfa.deleteFactor removes them.
 */
export async function clearMfaFactors(userId: string): Promise<void> {
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error) throw new Error(`clearMfaFactors: ${error.message}`);

  for (const factor of data.user?.factors ?? []) {
    const { error: deleteError } = await service.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    });
    if (deleteError) throw new Error(`clearMfaFactors: ${deleteError.message}`);
  }
}

export async function roleIn(user: keyof typeof USERS, slug: string): Promise<string | null> {
  const orgId = ORG_IDS[slug];
  if (!orgId) throw new Error(`roleIn: no seeded org id for ${slug}`);

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Straight to GoTrue rather than through a form, so there is no widget to
  // supply a token -- and [auth.captcha] is enabled. Cloudflare's always-passes
  // TEST secret verifies any non-empty string; same constant and same reasoning
  // as TEST_CAPTCHA in tests/isolation/helpers.ts.
  const { data: auth, error } = await anon.auth.signInWithPassword({
    ...USERS[user],
    options: { captchaToken: "cloudflare-test-secret-accepts-any-token" },
  });
  if (error || !auth.user) throw new Error(`roleIn: sign-in failed for ${user}`);

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error: readError } = await service
    .from("memberships")
    .select("role")
    .eq("profile_id", auth.user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) throw new Error(`roleIn: ${readError.message}`);

  return (data?.role as string | undefined) ?? null;
}

export const MANAGING_ROLES = ["organizer", "org_owner"] as const;

/**
 * RFC 6238 TOTP: 6 digits, SHA-1, 30-second step -- the parameters in GoTrue's
 * own otpauth URI (measured: `algorithm=SHA1&digits=6`).
 *
 * Written out rather than adding a dependency for one function, and it earns its
 * place: a spec that mocks `verify` proves only that our mock accepts our own
 * code. This lets the browser specs hand a REAL code to a real GoTrue.
 */
export function totp(base32Secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32Secret.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));

  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", bytes).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}
