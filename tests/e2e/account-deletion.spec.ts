import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { signInWithCredentials } from "./helpers";

/**
 * Account deletion through the real UI (S2, PR 10) — the second half of S2's
 * named edge case.
 *
 * A DISPOSABLE account, created here and deleted here. Using a seeded user would
 * anonymize them for every spec that runs afterwards, with no undo — and this
 * suite has already been bitten three times by residue that was merely
 * inconvenient.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const PASSWORD = "password123";

async function createDisposableAccount(): Promise<string> {
  const email = `e2e-deletion-${Date.now()}@f4milia.test`;
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create the disposable account: ${error.message}`);
  return email;
}

test("deleting an account signs it out and refuses it afterwards", async ({ page }) => {
  const email = await createDisposableAccount();

  await signInWithCredentials(page, email, PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto("/settings/account");

  // The consequences are on the page, not only inside the dialog: a confirmation
  // is where you check what you already understood, not where you read it.
  // .first(): the same line appears on the page AND inside the closed dialog,
  // which is deliberate -- the page is where it is read, the dialog where it is
  // re-checked. Playwright strict mode is right to object to the ambiguity.
  await expect(page.getByText("There is no undo", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "Delete my account" }).first().click();
  // The dialog repeats them, and its own confirm is the destructive submit.
  const dialog = page.locator("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete my account" }).click();

  await page.waitForURL(/\/login/);
  await expect(page.getByText("That account has been deleted", { exact: false })).toBeVisible();

  // Signed out everywhere: a protected page is no longer reachable.
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login/);

  /**
   * And the credential still works at GoTrue -- which is exactly why the app has
   * to refuse it. profiles.id cascades from auth.users, so deletion cannot remove
   * the GoTrue user without purging the profile row the retention policy
   * preserves. Signing in "succeeds" and lands nowhere.
   */
  await signInWithCredentials(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/login\?deleted=already|\/login/);
  await page.goto("/o/caregiver-circle");
  await expect(page).toHaveURL(/\/login/);
});

test("the confirmation can be dismissed without deleting anything", async ({ page }) => {
  const email = await createDisposableAccount();
  await signInWithCredentials(page, email, PASSWORD);
  await page.goto("/settings/account");

  await page.getByRole("button", { name: "Delete my account" }).first().click();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Still signed in, still on the page, nothing done.
  await expect(page).toHaveURL(/\/settings\/account/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);
});
