"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/copy";
import { SupportRateLimitExceeded, assertSupportRateLimitNotExceeded } from "@/lib/support";

const HELP = "/help";
const STAFF_INBOX = "/admin/support";

function backWithError(message: string): never {
  redirect(`${HELP}?error=${encodeURIComponent(message)}`);
}

/**
 * The one write path for H1's contact form.
 *
 * The run doc: "Help page: FAQ plus a contact form routing to platform_staff,
 * written to the audit log like every mutation." Nothing here writes to
 * audit_log by hand -- support_requests carries a database trigger, so the row
 * is logged whether it arrived through this action, through psql, or through a
 * future staff tool. Invariant 5 is explicit that app-layer audit calls are the
 * wrong mechanism.
 *
 * org_id is read from the form, and the form only ever offers Families the
 * signed-in member actually belongs to -- but that is a claim from the client,
 * so the insert policy checks it against memberships as well. This action does
 * not re-check it: one enforcement point, in the database, where every writer
 * passes through it. A 42501 from that policy lands in the generic failure
 * branch below, which is the correct outcome for a request nobody legitimate
 * can produce.
 */
export async function submitSupportRequest(formData: FormData) {
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const orgIdRaw = String(formData.get("org_id") ?? "").trim();
  // The "not about a specific Family" option submits an empty value, and that
  // has to become a real null rather than an empty string -- H1's whole edge
  // case is a request with no Family attached.
  const orgId = orgIdRaw === "" ? null : orgIdRaw;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // Checked here as well as by the CHECK constraints on the table, so somebody
  // who submits an empty form gets a sentence rather than a Postgres error.
  if (!subject) backWithError(copy.help.errors.subjectRequired);
  if (!body) backWithError(copy.help.errors.bodyRequired);

  try {
    await assertSupportRateLimitNotExceeded(supabase, userData.user.id);
  } catch (err) {
    if (err instanceof SupportRateLimitExceeded) backWithError(err.message);
    throw err;
  }

  const { error } = await supabase.from("support_requests").insert({
    submitted_by_profile_id: userData.user.id,
    org_id: orgId,
    subject,
    body,
  });

  if (error) {
    // Deliberately not error.message. A policy violation here reads
    // "new row violates row-level security policy for table
    // support_requests", which tells an ordinary person nothing and tells
    // someone probing exactly which rule stopped them.
    backWithError(copy.help.errors.failed);
  }

  revalidatePath(HELP);
  redirect(`${HELP}?sent=1`);
}

/**
 * Staff-only. Marks a request handled.
 *
 * No role check here, deliberately: the update policy is `is_platform_admin()`
 * and the grant is column-scoped to `status`, so a non-staff caller changes
 * nothing and a staff caller cannot touch the subject or body. Re-checking the
 * role in the action would add a second place to keep in sync with the first,
 * and would still not be the thing Postgres enforces.
 *
 * Nothing writes to audit_log by hand -- support_requests carries the trigger,
 * so the status change is logged with the acting staff member as the actor.
 */
export async function markSupportRequestHandled(formData: FormData) {
  const requestId = String(formData.get("request_id") ?? "").trim();

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  await supabase.from("support_requests").update({ status: "handled" }).eq("id", requestId);

  revalidatePath(STAFF_INBOX);
  redirect(STAFF_INBOX);
}
