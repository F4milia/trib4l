import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** Matches supabase/seed.sql; mirrors tests/isolation/helpers.ts. */
export const USERS = {
  alice: { email: "alice@f4milia.test", password: "password123" }, // member: caregiver-circle
  bob: { email: "bob@f4milia.test", password: "password123" }, // organizer: caregiver-circle
  carol: { email: "carol@f4milia.test", password: "password123" }, // org_owner: founder-collective
  dave: { email: "dave@f4milia.test", password: "password123" }, // member: wellness-guild
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
export async function signIn(page: Page, user: keyof typeof USERS) {
  await page.goto("/login");
  await page.fill("#email", USERS[user].email);
  await page.fill("#password", USERS[user].password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 }),
    page.click('button[type="submit"]'),
  ]);
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

export async function roleIn(user: keyof typeof USERS, slug: string): Promise<string | null> {
  const orgId = ORG_IDS[slug];
  if (!orgId) throw new Error(`roleIn: no seeded org id for ${slug}`);

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: auth, error } = await anon.auth.signInWithPassword(USERS[user]);
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
