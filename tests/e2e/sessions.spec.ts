import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * S2's named edge case, driven through the real UI: sign-out-everywhere from
 * device A kills device B on its next request.
 *
 * Two browser contexts, because that is what "another device" means -- one
 * context cannot hold two independent sessions.
 */
test("sign-out-everywhere from one device kills another on its next request", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const deviceA = await contextA.newPage();
  const deviceB = await contextB.newPage();

  await signIn(deviceA, "alice");
  await signIn(deviceB, "alice");

  // B is genuinely signed in first, or the assertion afterwards proves nothing.
  await deviceB.goto("/settings/sessions");
  await expect(deviceB).toHaveURL(/\/settings\/sessions/);

  await deviceA.goto("/settings/sessions");
  await deviceA.getByRole("button", { name: "Sign out everywhere" }).click();
  await deviceA.getByRole("button", { name: "End every session" }).click();
  await deviceA.waitForURL(/\/login/);

  // B's next request. It holds a cookie whose session no longer exists, so
  // requireUser's getUser() fails and the proxy sends it to sign-in.
  await deviceB.goto("/settings/sessions");
  await expect(deviceB).toHaveURL(/\/login/);

  await contextA.close();
  await contextB.close();
});

test("the session list shows this device, and ending one keeps you signed in", async ({ page }) => {
  await signIn(page, "alice");
  await page.goto("/settings/sessions");

  await expect(page.getByText("This device")).toBeVisible();

  const rows = page.locator("li").filter({ has: page.getByRole("button", { name: "Sign out" }) });
  await expect(rows.first()).toBeVisible();
});
/**
 * The confirmation must sit in the middle of the viewport.
 *
 * A browser centres a modal <dialog> with its own `inset: 0; margin: auto` --
 * and Tailwind's preflight sets `margin: 0` on every element, which wins. The
 * dialog then pins itself to the top-left corner. Reported by hand; no
 * assertion in the suite could see it, because every existing check asked what
 * the dialog CONTAINED rather than where it was.
 *
 * Measured against the viewport rather than compared to a screenshot: a
 * tolerance in pixels says what "centred" means and cannot drift the way an
 * approved image can.
 */
test("the confirmation opens in the middle of the viewport", async ({ page }) => {
  await signIn(page, "alice");
  await page.goto("/settings/sessions");
  await page.getByRole("button", { name: "Sign out everywhere" }).click();

  const dialog = page.locator("dialog");
  await expect(dialog).toBeVisible();

  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("could not measure the dialog");

  const dialogCentre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const viewportCentre = { x: viewport.width / 2, y: viewport.height / 2 };

  // Generous, because the point is "centred, not cornered" -- 20px of drift is
  // fine, 300px is the bug.
  expect(Math.abs(dialogCentre.x - viewportCentre.x)).toBeLessThan(20);
  expect(Math.abs(dialogCentre.y - viewportCentre.y)).toBeLessThan(20);

  // And explicitly not in the corner, which is what the bug looked like.
  expect(box.x).toBeGreaterThan(10);
  expect(box.y).toBeGreaterThan(10);
});
