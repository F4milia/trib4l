import { expect, test } from "@playwright/test";
import { ORG, signIn } from "./helpers";

test.describe("authentication", () => {
  test("sends an unauthenticated visitor to sign-in", async ({ page }) => {
    await page.goto(`/o/${ORG.caregiverCircle}`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs a member in and out again", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto("/");
    await expect(page.getByRole("button", { name: /log out/i })).toBeVisible();

    await page.getByRole("button", { name: /log out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 20_000 });

    // The session is genuinely gone, not just navigated away from.
    await page.goto(`/o/${ORG.caregiverCircle}`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("keeps a member out of an org they do not belong to", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto(`/o/${ORG.founderCollective}/settings/commerce`);
    // alice is a mentor here, not org_owner -- must not reach the surface.
    await expect(page).not.toHaveURL(/settings\/commerce/);
  });
});
