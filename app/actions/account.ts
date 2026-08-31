"use server";

import { redirect } from "next/navigation";
import { copy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";

/**
 * Deletes the caller's own account (S2).
 *
 * Thin on purpose. delete_my_account() performs every step of
 * docs/trib4l-docs/data-retention-policy.md in one transaction, revokes every
 * session, and writes its own audit row -- so there is nothing for this action to
 * decide and nothing it could add that would not be a second, weaker copy of a
 * rule that already holds where it matters.
 *
 * No id in the form, and none accepted: the function reads auth.uid(). There is
 * nothing here to tamper with.
 */
export async function deleteAccount() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    redirect("/login");
  }

  const { data: deleted, error } = await supabase.rpc("delete_my_account");

  if (error) {
    redirect("/settings/account?error=" + encodeURIComponent(copy.deleteAccount.errors.failed));
  }

  /**
   * `false` means the profile already carried deleted_at. Reported as such
   * rather than as success: the account IS deleted, so sending them onward is
   * right, but claiming this request did it would be false.
   */
  if (!deleted) {
    redirect("/login?deleted=already");
  }

  /**
   * The sessions are already gone server-side -- the function deleted them. This
   * clears the cookies this browser is still holding so the redirect does not
   * carry a dead session into /login.
   */
  await supabase.auth.signOut({ scope: "local" });

  redirect("/login?deleted=1");
}
