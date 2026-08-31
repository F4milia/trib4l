import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * TOTP enrollment through the real UI (S2, PR 7).
 *
 * The code is generated here from the setup key the page shows, which is the
 * only honest way to test this: a mocked verify would assert that our own mock
 * accepts our own code, and the thing worth proving is that a code derived from
 * the displayed secret satisfies a real GoTrue.
 */

/** RFC 6238 TOTP, 6 digits, SHA-1, 30s — the parameters in GoTrue's own otpauth
 *  URI (measured: `algorithm=SHA1&digits=6`). Written out rather than pulling in
 *  a dependency for one function in one spec. */
function totp(base32Secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32Secret.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );

  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", bytes).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

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
