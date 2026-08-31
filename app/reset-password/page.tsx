import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { copy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";

const t = copy.auth.resetPassword;

/**
 * Only reachable with the session the recovery link created. This is a plain
 * URL, so someone who never opened a link can arrive here; showing them a
 * password field would be offering an action that cannot work, and CLAUDE.md's
 * honest-empty-state rule covers exactly that.
 *
 * requireUser() is deliberately not used. It sends an unauthenticated caller
 * to /login, which is the wrong advice here -- what this person needs is a new
 * reset link, so they are sent to /forgot-password with a message saying so.
 *
 * No searchParams: the only thing that ever redirected here with an error was
 * updatePassword, which now returns its failures to the form as state.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !data.user) {
    redirect("/forgot-password?error=" + encodeURIComponent(t.errors.noSession));
  }

  return (
    <AuthShell eyebrow={t.eyebrow} title={t.title}>
      <ResetPasswordForm />
    </AuthShell>
  );
}
