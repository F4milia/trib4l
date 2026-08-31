"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { copy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";

/**
 * Revokes one of the caller's own sessions.
 *
 * No ownership check here, and that is not an omission: revoke_my_session()
 * filters on `user_id = auth.uid()` inside the database, so a tampered id in
 * the form deletes nothing. Re-checking in the action would be a second,
 * weaker copy of a rule that already holds where it matters -- and the audit
 * row is written in that same transaction, which an action cannot do.
 */
export async function revokeSession(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "");
  if (!sessionId) {
    redirect("/settings/sessions?error=" + encodeURIComponent(copy.sessions.errors.missingId));
  }

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    redirect("/login");
  }

  const { data: revoked, error } = await supabase.rpc("revoke_my_session", {
    p_session_id: sessionId,
  });

  if (error) {
    redirect("/settings/sessions?error=" + encodeURIComponent(copy.sessions.errors.revokeFailed));
  }

  /**
   * `false` means the row was already gone -- expired, or signed out on that
   * device a moment ago. Reported as done rather than as an error: the person
   * asked for that session to be gone and it is gone. It is also
   * indistinguishable from "not yours", which is deliberate in the function.
   */
  revalidatePath("/settings/sessions");
  redirect("/settings/sessions?revoked=" + (revoked ? "1" : "already"));
}

/**
 * Ends every session this person has, including this one.
 *
 * Through the database rather than supabase.auth.signOut({ scope: "global" }),
 * which does the same deletion in less code. The first version of this action
 * used GoTrue and it was wrong: GoTrue deletes the rows itself, so nothing in
 * the database sees the mutation, and the audit row then has to be written from
 * here -- an app-layer audit call outside the mutation's transaction, which is
 * exactly what invariant 5 rules out. A failure between the two would record an
 * event that did not happen, or end every session with no record at all.
 *
 * The RPC does the delete and the audit write in one transaction. The signOut
 * afterwards is local-only: the sessions are already gone server-side, and this
 * just clears this browser's cookies so the redirect does not carry a dead one.
 */
export async function signOutEverywhere() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("revoke_all_my_sessions");
  if (error) {
    redirect("/settings/sessions?error=" + encodeURIComponent(copy.sessions.errors.signOutAllFailed));
  }

  await supabase.auth.signOut({ scope: "local" });

  redirect("/login?signed_out=all");
}
