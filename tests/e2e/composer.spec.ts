import { expect, test } from "@playwright/test";
import { ORG, signIn } from "./helpers";

/**
 * The single most valuable spec for Phase E: it proves a server action still
 * receives its form. §4.6's grids move markup around forms whose fields are
 * wired through action={}, and a field that lands outside its <form> stops
 * submitting silently.
 */
test("a member can post to the feed, and the post appears", async ({ page }) => {
  await signIn(page, "alice");
  // /feed, not the org root. D1 moved the inherited posts feed off
  // `/o/[slug]` so the dashboard can take the route a member lands on daily.
  // Following the redirect would still pass today and would break the moment
  // the dashboard replaces it -- so this points at where the composer lives.
  await page.goto(`/o/${ORG.caregiverCircle}/feed`);

  const body = `e2e composer check ${process.env.E2E_STAMP ?? "local"}-${Math.random().toString(36).slice(2, 8)}`;
  await page.fill('textarea[name="body"]', body);
  await page.getByRole("button", { name: /^Post$/ }).click();

  await expect(page.getByText(body)).toBeVisible({ timeout: 20_000 });
});
