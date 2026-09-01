import { expect, test } from "@playwright/test";
import { ORG, signIn } from "./helpers";

/**
 * D1 -- the member home dashboard.
 *
 * The run doc's acceptance: "every element reflects live seeded data. Tower
 * progress renders as blocks. Loads correctly for a brand-new Family with no
 * Tower yet -- honest empty states, no invented placeholders."
 *
 * And its named edge case, which the second block below is entirely about:
 * "Dual-Family member switches Families -- Tower, streak, Vow holder all
 * switch with zero bleed."
 *
 * Values are asserted against supabase/seed.sql, which
 * supabase/tests/database/180_seed_domain_data.sql pins. If the seed changes,
 * 180 goes red first and names the number, which is a better failure than this
 * file guessing.
 */

test.describe("the member home dashboard", () => {
  test("renders all six elements from live seeded data", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto(`/o/${ORG.caregiverCircle}`);

    // 4. Today at the Table. Alice has NOT written today in this Family --
    //    seeded that way on purpose, so the actionable state is the one a
    //    reviewer sees rather than the finished one.
    await expect(page.getByText("You have not written today.")).toBeVisible();

    // 3. Tower progress, as stacked masonry rather than a bar. The container
    //    is role=img with the count in its label; the bricks are decorative.
    await expect(page.getByText("Bring Mum home", { exact: true })).toBeVisible();
    const masonry = page.getByRole("img", { name: /Bricks laid: 2 of 6/ });
    await expect(masonry).toBeVisible();
    // Twenty-four bricks, per §7.9 -- proves it is brickwork and not a bar.
    await expect(masonry.locator("span")).toHaveCount(24);

    // 2. Their claimed Bricks, with due windows, and the overdue one stamped.
    await expect(page.getByText("Fit the stair rail")).toBeVisible();
    await expect(page.getByText("Order the shower seat")).toBeVisible();
    await expect(page.getByText("Overdue")).toBeVisible();
    // A Brick they finished is not in this list: it is done.
    await expect(page.getByText("Draft the week one rota")).toHaveCount(0);

    // 6. The current Vow holder.
    await expect(page.getByText("I will ring the ward every morning before work")).toBeVisible();
    await expect(page.getByText(/Held by\s+Bob/)).toBeVisible();

    // 5. The streak. Six distinct days in this Family.
    await expect(page.getByText("days at the Table")).toBeVisible();
    await expect(page.getByText("6", { exact: true })).toBeVisible();

    // 1. Recent Ledger highlights.
    await expect(page.getByText("The care rota is covered.")).toBeVisible();
  });

  /**
   * THE NAMED EDGE CASE. Alice is a member of caregiver-circle and a mentor of
   * founder-collective, and the seed gives the two Families deliberately
   * different content -- identical data would pass every assertion here while
   * proving nothing.
   */
  test("a dual-Family member switches Families with zero bleed", async ({ page }) => {
    await signIn(page, "alice");

    await page.goto(`/o/${ORG.caregiverCircle}`);
    await expect(page.getByText("Bring Mum home", { exact: true })).toBeVisible();
    await expect(page.getByText(/Held by\s+Bob/)).toBeVisible();
    await expect(page.getByRole("img", { name: /Bricks laid: 2 of 6/ })).toBeVisible();

    await page.goto(`/o/${ORG.founderCollective}`);

    // The Tower switched...
    await expect(page.getByText("Ship the pilot to ten families", { exact: true })).toBeVisible();
    // ...the Vow holder switched...
    await expect(page.getByText(/Held by\s+Carol/)).toBeVisible();
    // ...and the streak switched: 3 here against 6 there.
    await expect(page.getByText("days at the Table")).toBeVisible();
    await expect(page.getByText("3", { exact: true })).toBeVisible();

    // ZERO BLEED. Nothing from the other Family survives the switch.
    await expect(page.getByText("Bring Mum home")).toHaveCount(0);
    await expect(page.getByText("I will ring the ward every morning before work")).toHaveCount(0);
    await expect(page.getByText("Fit the stair rail")).toHaveCount(0);
    await expect(page.getByText("The care rota is covered.")).toHaveCount(0);
  });

  /**
   * A mentor sees the same screen, degrading on its own -- the settled answer
   * to a question spec 10.1 leaves open. Alice is a MENTOR in
   * founder-collective, so the Family-level elements render and her personal
   * ones are honestly empty.
   */
  test("a mentor sees Family-level elements and honestly empty personal ones", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto(`/o/${ORG.founderCollective}`);

    await expect(page.getByText("Ship the pilot to ten families", { exact: true })).toBeVisible();
    await expect(page.getByText(/Held by\s+Carol/)).toBeVisible();

    await expect(page.getByText("Nothing claimed. Open Bricks are on the Family board.")).toBeVisible();
    await expect(page.getByText("You have not written today.")).toBeVisible();
  });

  /**
   * The second half of the acceptance criterion, and the reason wellness-guild
   * is seeded deliberately empty: "loads correctly for a brand-new Family with
   * no Tower yet -- honest empty states, no invented placeholders."
   */
  test("a Family with no Tower loads, and says so honestly", async ({ page }) => {
    await signIn(page, "dave");
    await page.goto(`/o/${ORG.wellnessGuild}`);

    await expect(
      page.getByText("No Tower yet. A Family between Towers is a quiet season, not a gap."),
    ).toBeVisible();
    await expect(page.getByText("Nothing claimed. Open Bricks are on the Family board.")).toBeVisible();
    await expect(page.getByText("No Vow is being held right now.")).toBeVisible();
    await expect(page.getByText("Nothing recorded yet. The Ledger fills as the Family works.")).toBeVisible();

    // The streak renders a NUMBER, not an empty state. Nought is a real
    // answer, and different from having no streak at all.
    await expect(page.getByText("0", { exact: true })).toBeVisible();
    await expect(page.getByText("days at the Table")).toBeVisible();

    // No masonry at all, rather than an empty wall implying a Tower exists.
    await expect(page.getByRole("img", { name: /Bricks laid/ })).toHaveCount(0);
  });
});
