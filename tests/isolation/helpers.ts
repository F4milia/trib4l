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

export const ORG_IDS = {
  caregiverCircle: "00000000-0000-0000-0000-00000000000a",
  founderCollective: "00000000-0000-0000-0000-00000000000b",
  wellnessGuild: "00000000-0000-0000-0000-00000000000c",
} as const;

/**
 * Bypasses RLS entirely, same as the real Mux webhook route
 * (createServiceClient in lib/supabase/service.ts). Used only to
 * simulate the state a real webhook would have produced (status,
 * playback_id, moderation_state) -- tests should never reach for this to
 * shortcut around RLS they mean to be testing.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function signInAs(user: { email: string; password: string }): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword(user);
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
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signUp({ email, password: "password123" });
  if (error) throw new Error(`signUp failed for ${email}: ${error.message}`);
  return client;
}

/**
 * Enrolls TOTP MFA on an already-signed-in client and verifies it,
 * elevating the session from aal1 to aal2 -- exactly the step a real
 * platform_admin login would require, done here via the API so it's
 * testable without any UI.
 */
export async function elevateToAal2(client: SupabaseClient<Database>): Promise<void> {
  // A random friendly name avoids "factor already exists" collisions when
  // this suite runs more than once against the same seeded DB without an
  // intervening `supabase db reset` -- otherwise the second run's enroll
  // call for the same user collides with the first run's leftover factor.
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
