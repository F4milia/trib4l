import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as OTPAuth from "otpauth";
import type { Database } from "../../lib/supabase/database.types";

// Well-known local-dev-only credentials from `supabase start` -- never
// valid against a hosted project. Override via env for CI if the local
// stack's keys ever change.
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Matches supabase/seed.sql. If the seed data changes, these fall out of
// sync fast -- keep them next to each other conceptually even though they
// live in different files.
export const SEEDED_USERS = {
  alice: { email: "alice@f4milia.test", password: "password123" }, // member: caregiver-circle, mentor: founder-collective
  bob: { email: "bob@f4milia.test", password: "password123" }, // organizer: caregiver-circle
  carol: { email: "carol@f4milia.test", password: "password123" }, // org_owner: founder-collective
  dave: { email: "dave@f4milia.test", password: "password123" }, // member: wellness-guild
  erin: { email: "erin@f4milia.test", password: "password123" }, // platform_staff
  frank: { email: "frank@f4milia.test", password: "password123" }, // platform_staff
} as const;

/**
 * The named QA fixtures from docs/qa-previous-session-sop.md, prerequisite 2.
 *
 * Each account is named for the STATE IT IS IN rather than for a person, so a
 * QA step can say "log in as departed@f4milia.test" and mean something exact
 * instead of "create a user who...". They live in qa-family-a and qa-family-b,
 * deliberately apart from the six accounts above: caregiver-circle,
 * founder-collective and wellness-guild have their member counts, streaks and
 * Tower titles asserted across 26 isolation files, and a fixture that perturbs
 * those breaks tests that exist to catch real regressions.
 */
export const QA_FIXTURES = {
  dual: { email: "dual@f4milia.test", password: "password123" }, // org_owner of qa-family-a, member of qa-family-b
  blocker: { email: "blocker@f4milia.test", password: "password123" }, // has blocked `blocked`
  blocked: { email: "blocked@f4milia.test", password: "password123" }, // two Table entries, hidden from `blocker` only
  departed: { email: "departed@f4milia.test", password: "password123" }, // membership soft-deleted; Bricks reverted to open
  memorial: { email: "memorial@f4milia.test", password: "password123" }, // profile memorial-locked; entries persist
  second: { email: "second@f4milia.test", password: "password123" }, // joined qa-family-a, did not create it
  orphan: { email: "orphan@f4milia.test", password: "password123" }, // signed up, no membership anywhere
  staff1: { email: "staff1@f4milia.test", password: "password123" }, // platform_staff WITH a seeded verified TOTP factor
  staff2: { email: "staff2@f4milia.test", password: "password123" },
} as const;

/**
 * The TOTP secret seeded for staff1@ and staff2@, so a test or a QA script can
 * produce a valid code without enrolling a factor first. Invariant 7 enforces
 * two-factor for platform_staff at sign-in, so staff routes are unreachable
 * without one.
 *
 *   new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(QA_TOTP_SECRET) }).generate()
 */
export const QA_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export const ORG_IDS = {
  caregiverCircle: "00000000-0000-0000-0000-00000000000a",
  founderCollective: "00000000-0000-0000-0000-00000000000b",
  wellnessGuild: "00000000-0000-0000-0000-00000000000c",
  // The QA fixture Families. Kept separate from the three above on purpose --
  // see QA_FIXTURES.
  qaFamilyA: "00000000-0000-0000-0000-00000000000d",
  qaFamilyB: "00000000-0000-0000-0000-00000000000e",
} as const;

/**
 * Bypasses RLS entirely, same as the real Mux webhook route
 * (createServiceClient in lib/supabase/service.ts). Used only to
 * simulate the state a real webhook would have produced (status,
 * playback_id, moderation_state) -- tests should never reach for this to
 * shortcut around RLS they mean to be testing.
 */
/**
 * The captcha token every guarded call has to carry now that S2 enabled
 * [auth.captcha].
 *
 * ANY non-empty string satisfies GoTrue while the secret is Cloudflare's
 * published always-passes TEST secret. Measured 2026-09-01 against this stack:
 * a token of "dummy" returns 200, and no token at all returns 400
 * `captcha_failed` / "no captcha_token found". Named rather than inlined so the
 * reason travels with it, and so pointing the config at the always-BLOCKS
 * secret to exercise the negative path is a one-line edit.
 *
 * GoTrue's ADMIN API is not captcha-guarded, which is why signUpNewUser's
 * createUser call below needs no token and only its sign-in does.
 */
export const TEST_CAPTCHA = { captchaToken: "cloudflare-test-secret-accepts-any-token" } as const;

export function createServiceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function signInAs(user: { email: string; password: string }): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword({ ...user, options: TEST_CAPTCHA });
  if (error) throw new Error(`Failed to sign in as ${user.email}: ${error.message}`);
  return client;
}

/**
 * Signs up a brand-new account with no memberships at all. Useful for
 * tests that need a person guaranteed not to have been touched by another
 * test file's side effects -- seeded users' roles can be mutated by
 * whichever test runs first in a given suite execution (e.g. an
 * invitations test that promotes Alice to organizer), since all isolation
 * test files share one database within a single `db reset`.
 */
export async function signUpNewUser(email: string): Promise<SupabaseClient<Database>> {
  const password = "password123";

  // Created pre-confirmed through the admin API rather than through
  // auth.signUp. S1 turned on `[auth.email] enable_confirmations`, so signUp
  // now returns `session: null` and every caller below would be holding an
  // unauthenticated client -- which is exactly the behaviour
  // tests/isolation/email-verification.test.ts asserts on purpose.
  //
  // The intent of this helper is unchanged and no assertion anywhere is
  // weakened: callers want a real user with real credentials and no
  // memberships, not an unverified one. Verification is now a separate
  // concern with its own test file, so it is settled here rather than
  // silently entangled with every other suite.
  const service = createServiceRoleClient();
  const { error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw new Error(`createUser failed for ${email}: ${createError.message}`);

  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword({
    email,
    password,
    options: TEST_CAPTCHA,
  });
  if (error) throw new Error(`sign-in failed for new user ${email}: ${error.message}`);
  return client;
}

/** An unauthenticated client on the anon key -- the credential a signed-out
 *  or unverified visitor holds. */
export function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Enrolls TOTP MFA on an already-signed-in client and verifies it,
 * elevating the session from aal1 to aal2 -- exactly the step a real
 * platform_admin login would require, done here via the API so it's
 * testable without any UI.
 */
/**
 * Removes every MFA factor a user holds, through the ADMIN API.
 *
 * Not through the database: grants here are least-privilege per migration and
 * service_role has no privilege on the auth schema, while admin.getUserById
 * returns the factor list and admin.mfa.deleteFactor removes them.
 */
export async function clearMfaFactors(userId: string): Promise<void> {
  const service = createServiceRoleClient();
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

export async function elevateToAal2(client: SupabaseClient<Database>): Promise<void> {
  // ESTABLISH THE PRECONDITION, do not assume it.
  //
  // GoTrue refuses `enroll` from an aal1 session once a VERIFIED factor
  // exists, so a leftover factor from an earlier run makes this fail with
  // "AAL2 required to enroll a new factor" -- an error naming the thing being
  // set up rather than the residue that broke it. The random friendly name
  // below was not enough: it avoids a NAME collision, and the refusal is about
  // the session's assurance level.
  //
  // Clearing first is the only fix available at this point in the flow.
  // Unenrolling at the END of each spec has to happen while the session still
  // holds aal2 -- a window a FAILING test never reaches, which is how the
  // residue accumulated in the first place.
  const { data: userData } = await client.auth.getUser();
  if (userData.user?.id) {
    await clearMfaFactors(userData.user.id);
  }

  const { data: enrollData, error: enrollError } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `isolation-test-${crypto.randomUUID()}`,
  });
  if (enrollError || !enrollData) throw new Error(`MFA enroll failed: ${enrollError?.message}`);

  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(enrollData.totp.secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  const code = totp.generate();

  const { data: challengeData, error: challengeError } = await client.auth.mfa.challenge({
    factorId: enrollData.id,
  });
  if (challengeError || !challengeData) throw new Error(`MFA challenge failed: ${challengeError?.message}`);

  const { error: verifyError } = await client.auth.mfa.verify({
    factorId: enrollData.id,
    challengeId: challengeData.id,
    code,
  });
  if (verifyError) throw new Error(`MFA verify failed: ${verifyError.message}`);
}

export async function currentAal(client: SupabaseClient<Database>): Promise<string | undefined> {
  const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel ?? undefined;
}
