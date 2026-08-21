import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

type AuditTarget = { type: string; id?: string; orgId?: string };

/**
 * Every platform_admin code path that reads across orgs must go through
 * this -- RLS grants the bypass itself (see the `is_platform_admin()`
 * policy clause), but Postgres has no hook to log a SELECT as it happens,
 * so the log write has to be a required step in the calling code instead.
 * Writes the audit row *before* running `fn`, matching Invariant 4
 * ("audit row before the first impersonated request is served").
 */
export async function withAdminAudit<T>(
  supabase: SupabaseClient<Database>,
  action: string,
  target: AuditTarget,
  fn: () => Promise<T>,
): Promise<T> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw userError ?? new Error("withAdminAudit requires an authenticated session");
  }

  const { error: logError } = await supabase.from("audit_log").insert({
    actor_profile_id: userData.user.id,
    org_id: target.orgId ?? null,
    action,
    target_type: target.type,
    target_id: target.id ?? null,
  });
  if (logError) {
    throw logError;
  }

  return fn();
}
