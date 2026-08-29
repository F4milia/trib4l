import { redirect } from "next/navigation";
import { updatePassword } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";
import { Button, Label } from "@/components/ui";
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
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !data.user) {
    redirect("/forgot-password?error=" + encodeURIComponent(t.errors.noSession));
  }

  return (
    <AuthShell eyebrow={t.eyebrow} title={t.title} error={error}>
      <form action={updatePassword} className="space-y-5">
        <p className="text-sm text-deep-slate/70">{t.body}</p>
        <div>
          <Label htmlFor="password">{t.passwordLabel}</Label>
          <PasswordInput
            name="password"
            id="password"
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>
        <div>
          <Label htmlFor="password_confirmation">{t.confirmLabel}</Label>
          <PasswordInput
            name="password_confirmation"
            id="password_confirmation"
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>
        <Button type="submit" className="w-full">
          {t.submit}
        </Button>
      </form>
    </AuthShell>
  );
}
