import { expect, type Page } from "@playwright/test";

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
