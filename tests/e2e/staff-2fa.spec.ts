import { expect, test } from "@playwright/test";
import { ORG, USER_IDS, clearMfaFactors, signIn, totp } from "./helpers";

/**
 * Invariant 7 through the product: 2FA is enforced for platform_staff, not
 * merely documented.
 *
 * S2's acceptance criterion reads "a platform_staff account without 2FA cannot
 * complete sign-in". Taken literally that is not something this app can do --
 * GoTrue issues a session for a correct password, and refusing to let staff hold
 * a session at all would leave them no way to ever enrol. What is enforceable,
 * and what these specs prove, is that such an account reaches NOTHING: not a
 * Family, not the admin surface, not its own settings index. Only the enrolment
 * page.
 *
 * The stronger, database-level half of the invariant predates this session:
 * is_platform_admin() has required aal2 since Session 2, so the platform bypass
 * is already unavailable at aal1 regardless of any app-layer check.
 * tests/isolation/platform-admin.test.ts owns that proof.
 */
test.describe("platform staff without an authenticator", () => {
  /**
   * Establishes the precondition instead of assuming it. The isolation suite
   * enrols a real factor on erin (elevateToAal2) and leaves it, so on a shared
   * local database this describe block would otherwise be testing "staff WITH an
   * authenticator" -- and reporting the gate broken when it was working.
   */
  test.beforeEach(async () => {
    await clearMfaFactors(USER_IDS.erin);
  });

  test("is sent to enrolment on sign-in, and told why", async ({ page }) => {
    await signIn(page, "erin");

    await expect(page).toHaveURL(/\/settings\/security/);
    await expect(
      page.getByText("Your account is platform staff", { exact: false }),
    ).toBeVisible();
  });

  test("cannot reach a Family, the admin surface, or any other page", async ({ page }) => {
    await signIn(page, "erin");

    for (const path of [
      "/",
      `/o/${ORG.caregiverCircle}`,
      "/admin/organizations/new",
      "/settings",
      "/settings/sessions",
    ]) {
      await page.goto(path);
      // Every one of these calls requireUser() without the opt-out, so the gate
      // turns them all into the same destination.
      await expect(page, `expected ${path} to be gated`).toHaveURL(/\/settings\/security/);
    }
  });

  /**
   * The enrolment page itself must stay reachable, or the gate is a lockout with
   * no exit. Asserted separately because it is the one hole the design needs.
   */
  test("can still reach enrolment and start setting up", async ({ page }) => {
    await signIn(page, "erin");
    await page.goto("/settings/security");
    await page.getByRole("button", { name: "Set up an authenticator" }).click();
    await expect(page.locator("#totp-secret")).toBeVisible();
  });
});

/**
 * The other half, and the part the prompt did not ask for: once an ordinary
 * member enrols, a password alone must stop being enough. Otherwise "two-factor
 * is on" is a claim the product does not honour.
 */
test.describe("an ordinary member is unaffected until they enrol", () => {
  test("reaches the product normally with no authenticator", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "Your account." })).toBeVisible();
  });
});

/**
 * The half the prompt did not ask for, and the half without which "two-factor is
 * on" is a claim the product does not honour: once a MEMBER enrols, a correct
 * password alone must stop being enough.
 *
 * Two browser contexts, because the point is a NEW sign-in. Enrolling raises the
 * current session to aal2, so asserting inside that same context would prove
 * nothing about what a password on its own gets you.
 */
test.describe("a member who has enrolled", () => {
  test.beforeEach(async () => {
    await clearMfaFactors(USER_IDS.dave);
  });

  test.afterEach(async () => {
    // Left as found, so a second consecutive run behaves identically (Q4).
    await clearMfaFactors(USER_IDS.dave);
  });

  test("is asked for a code on the next sign-in, and gets in with a real one", async ({
    browser,
  }) => {
    const enrolling = await browser.newContext();
    const enrolPage = await enrolling.newPage();
    await signIn(enrolPage, "dave");
    await enrolPage.goto("/settings/security");
    await enrolPage.getByRole("button", { name: "Set up an authenticator" }).click();

    const secret = await enrolPage.locator("#totp-secret").inputValue();
    await enrolPage.fill("#totp-code", totp(secret));
    await enrolPage.getByRole("button", { name: "Turn on two-factor" }).click();
    await expect(enrolPage.getByText("Two-factor is on.", { exact: false })).toBeVisible();
    await enrolling.close();

    // A fresh browser: password only, which is now aal1 and not enough.
    const returning = await browser.newContext();
    const page = await returning.newPage();
    await signIn(page, "dave");

    await expect(page).toHaveURL(/\/auth\/verify/);

    // And a real code finishes the job.
    await page.fill("#code", totp(secret));
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).not.toHaveURL(/\/auth\/verify/);

    // Now the product is reachable, which it was not a moment ago.
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await returning.close();
  });

  test("cannot reach the product by skipping the code screen", async ({ browser }) => {
    const enrolling = await browser.newContext();
    const enrolPage = await enrolling.newPage();
    await signIn(enrolPage, "dave");
    await enrolPage.goto("/settings/security");
    await enrolPage.getByRole("button", { name: "Set up an authenticator" }).click();
    const secret = await enrolPage.locator("#totp-secret").inputValue();
    await enrolPage.fill("#totp-code", totp(secret));
    await enrolPage.getByRole("button", { name: "Turn on two-factor" }).click();
    await expect(enrolPage.getByText("Two-factor is on.", { exact: false })).toBeVisible();
    await enrolling.close();

    const returning = await browser.newContext();
    const page = await returning.newPage();
    await signIn(page, "dave");

    // Typing a URL is the obvious way to try to walk around a redirect.
    for (const path of ["/", "/settings/sessions", `/o/${ORG.wellnessGuild}`]) {
      await page.goto(path);
      await expect(page, `expected ${path} to demand a code`).toHaveURL(/\/auth\/verify/);
    }
    await returning.close();
  });
});
