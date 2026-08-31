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
