import { expect, test } from "@playwright/test";
import { ORG, signIn } from "./helpers";

/**
 * The nav is where Phase E's restructuring is most likely to leak a
 * role-gated link. orgNav() is unit-tested, but only an end-to-end pass
 * proves the server actually resolves the role and renders accordingly.
 */
test.describe("org navigation", () => {
  /**
   * dave, not alice. alice is the dual-Family fixture, but
   * tests/isolation/invitations.test.ts durably promotes her to organizer
   * within a run -- documented in tests/isolation/helpers.ts, which works
   * around it the same way. So "a member sees no Manage section" passed or
   * failed here depending on whether the isolation suite had run since the
   * last `db reset`. dave is a plain member of wellness-guild and stays one:
   * role-escalation.test.ts attempts promotion there precisely so it fails.
   */
  test("shows a member the community section and no manage section", async ({ page }) => {
    await signIn(page, "dave");
    await page.goto(`/o/${ORG.wellnessGuild}`);

    const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
    await expect(nav.getByRole("link", { name: /Members/ })).toBeVisible();
    await expect(nav.getByText("Manage")).toHaveCount(0);
    await expect(nav.getByRole("link", { name: /Invitations/ })).toHaveCount(0);
  });

  test("shows an organizer the manage section but not commerce", async ({ page }) => {
    await signIn(page, "bob");
    await page.goto(`/o/${ORG.caregiverCircle}`);

    const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
    await expect(nav.getByText("Manage")).toBeVisible();
    await expect(nav.getByRole("link", { name: /Invitations/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Commerce/ })).toHaveCount(0);
  });

  test("marks the current page and inverts it", async ({ page }) => {
    await signIn(page, "bob");
    await page.goto(`/o/${ORG.caregiverCircle}/members`);

    const current = page.locator('aside a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveCSS("background-color", "rgb(26, 26, 26)");
    await expect(current).toHaveCSS("border-left-color", "rgb(188, 71, 46)");
  });

  test("hides the sidebar on mobile and opens the same nav from the disclosure", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "bob");
    await page.goto(`/o/${ORG.caregiverCircle}`);

    // Scoped to the aside that CONTAINS the main navigation. D1's dashboard
    // adds a second complementary landmark -- its reference rail -- so a bare
    // locator("aside") now resolves to two elements and fails strict mode.
    // This asserts exactly what it did before: the sidebar is hidden on mobile.
    await expect(
      page.locator("aside").filter({ has: page.getByRole("navigation", { name: "Main navigation" }) }),
    ).toBeHidden();
    const summary = page.locator("summary");
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(page.locator("details a").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Invitations/ }).first()).toBeVisible();
  });
});
