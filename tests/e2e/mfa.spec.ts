import { expect, test } from "@playwright/test";
import { USER_IDS, clearMfaFactors, signIn, totp } from "./helpers";

/**
 * TOTP enrollment through the real UI (S2, PR 7).
 *
 * The code is generated here from the setup key the page shows, which is the
 * only honest way to test this: a mocked verify would assert that our own mock
 * accepts our own code, and the thing worth proving is that a code derived from
 * the displayed secret satisfies a real GoTrue.
 */

/**
 * Preconditions established rather than assumed. The isolation suite enrols real
 * factors on bob and erin (elevateToAal2), and this spec's own earlier version
 * left one on dave -- so on a shared local database these specs were testing a
 * different starting state than they described, and reporting product bugs that
 * were not there.
 */
test.beforeEach(async () => {
  await clearMfaFactors(USER_IDS.dave);
  await clearMfaFactors(USER_IDS.bob);
  await clearMfaFactors(USER_IDS.carol);
});

test("a member can turn on two-factor with a real authenticator code", async ({ page }) => {
  await signIn(page, "dave");
  await page.goto("/settings/security");

  /**
   * Deliberately no assertion about the starting state. tests/isolation/
   * helpers.ts already records why: "seeded roles are not stable within a run...
   * a spec that hardcodes [them] passes or fails depending on what ran before
   * it". An earlier run of this very spec can have left a factor on this
   * account, and asserting "no authenticator" up front is that trap -- it is how
   * this spec failed twice while the code under test was fine.
   *
   * What is asserted is the TRANSITION and the end state, both of which are
   * facts about this run.
   */
  await page.getByRole("button", { name: "Set up an authenticator" }).click();

  // The QR is a data: URI from Supabase. If next/image rejected it, this fails.
  const qr = page.locator("img");
  await expect(qr).toBeVisible();
  expect(await qr.getAttribute("src")).toContain("data:image/svg+xml");

  const secret = await page.locator("#totp-secret").inputValue();
  expect(secret.length).toBeGreaterThan(0);

  await page.fill("#totp-code", totp(secret));
  await page.getByRole("button", { name: "Turn on two-factor" }).click();

  await expect(page.getByText("Two-factor is on.", { exact: false })).toBeVisible();

  // And it is listed as a live authenticator on reload, not just announced once.
  await page.goto("/settings/security");
  await expect(page.getByRole("button", { name: "Remove" }).first()).toBeVisible();

  /**
   * Removed again, for two reasons. It covers unenroll -- which needs an aal2
   * session, and this session has one precisely because the code above was
   * accepted, so this is the only point in the suite where the removal path is
   * reachable. And it leaves the seeded account as it was found: without this,
   * the "No authenticator is set up" assertion above fails on a second
   * consecutive run of the suite, which is Q4's named edge case.
   */
  const removeButtons = page.getByRole("button", { name: "Remove" });
  // A loop, not one click: an earlier run of this spec (before it cleaned up
  // after itself) can have left a factor behind, and removing one of two leaves
  // the account still protected -- which is how this assertion failed the first
  // time. Bounded so a broken remove cannot spin here forever.
  for (let attempt = 0; attempt < 10 && (await removeButtons.count()) > 0; attempt += 1) {
    await removeButtons.first().click();
    await expect(page.getByText("That authenticator was removed.")).toBeVisible();
  }
  await expect(page.getByText("No authenticator is set up on this account.")).toBeVisible();
});

test("a wrong code is refused with a message that says what to do", async ({ page }) => {
  await signIn(page, "carol");
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Set up an authenticator" }).click();

  await page.fill("#totp-code", "000000");
  await page.getByRole("button", { name: "Turn on two-factor" }).click();

  await expect(page.getByText("Codes expire every 30 seconds", { exact: false })).toBeVisible();
  // Still on the scan step, with the setup key intact, so a second try is possible.
  await expect(page.locator("#totp-secret")).toBeVisible();
});

/**
 * "Start again" must work while a setup is half-finished. The code field is
 * `required`, so the button carries formNoValidate -- without it the browser
 * blocks the submit and the only escape from a half-finished setup is a page
 * reload. Asserted in a real browser because jsdom does not enforce constraint
 * validation, so a unit test would pass either way.
 */
test("starting again during setup issues a fresh key", async ({ page }) => {
  await signIn(page, "bob");
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Set up an authenticator" }).click();

  const first = await page.locator("#totp-secret").inputValue();
  expect(first.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Start again" }).click();

  /**
   * Waiting for the VALUE to change, not merely for the field to be visible.
   * The old input stays on screen through the transition, so a visibility check
   * passes instantly and reads the previous secret -- which is exactly how this
   * assertion failed the first time, reporting a product bug that was not there.
   */
  await expect(page.locator("#totp-secret")).not.toHaveValue(first);

  const second = await page.locator("#totp-secret").inputValue();
  expect(second.length).toBeGreaterThan(0);
  // A new factor, not the old one resumed: the previous secret is unrecoverable
  // by design, so reusing it would be impossible anyway.
  expect(second).not.toBe(first);
});

/**
 * The state that exposed a real defect: an account that HAS an authenticator but
 * has not used it this session.
 *
 * GoTrue refuses both enrol and unenrol from an aal1 session, so the page used to
 * offer a "Set up an authenticator" button whose only possible answer was "Setup
 * could not be started. Try again." Found by this suite, on bob, because the
 * isolation run had left him a factor.
 */
test("an authenticator already set up, unused this session, offers a code instead of a broken setup", async ({
  browser,
}) => {
  const enrolling = await browser.newContext();
  const enrolPage = await enrolling.newPage();
  await signIn(enrolPage, "carol");
  await enrolPage.goto("/settings/security");
  await enrolPage.getByRole("button", { name: "Set up an authenticator" }).click();
  const secret = await enrolPage.locator("#totp-secret").inputValue();
  await enrolPage.fill("#totp-code", totp(secret));
  await enrolPage.getByRole("button", { name: "Turn on two-factor" }).click();
  await expect(enrolPage.getByText("Two-factor is on.", { exact: false })).toBeVisible();
  await enrolling.close();

  const returning = await browser.newContext();
  const page = await returning.newPage();
  await signIn(page, "carol");
  await page.goto("/settings/security");

  await expect(
    page.getByText("Enter a code from your authenticator to change these settings."),
  ).toBeVisible();
  // Neither impossible action is offered.
  await expect(page.getByRole("button", { name: "Set up an authenticator" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Remove" })).toBeHidden();
  // And the way forward is a link, not a dead end.
  await expect(page.getByRole("link", { name: "Enter a code" })).toBeVisible();

  await returning.close();
  await clearMfaFactors(USER_IDS.carol);
});
