import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { AssuranceForm } from "@/components/auth/assurance-form";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui";
import { assuranceOutcome } from "@/lib/auth/assurance";
import { copy } from "@/lib/copy";
import { requireUser } from "@/lib/session";

const t = copy.assurance;

/**
 * Where anyone holding a verified authenticator presents a code (S2).
 *
 * Styled with AuthShell rather than as a settings page, because that is what it
 * is: the second half of signing in. It is the same visual language as /login,
 * which is what makes it read as an expected step rather than an error.
 *
 * `skipAssuranceGate` because the gate sends people HERE -- gating it would be a
 * loop. The page does its own check instead, and it is the stricter one: it
 * refuses to render for anyone who does not actually need it.
 */
export default async function VerifyPage() {
  const { supabase } = await requireUser({ skipAssuranceGate: true });
  const outcome = await assuranceOutcome(supabase);

  /**
   * Already verified, or nothing to verify -- there is no code to ask for, and
   * showing the form anyway would be a dead end. Sent onward rather than told
   * off: `staff-must-enrol` goes to enrolment, everything satisfied goes home.
   */
  if (outcome.ok) {
    redirect("/");
  }
  if (outcome.reason === "staff-must-enrol") {
    redirect(outcome.redirectTo);
  }

  return (
    <AuthShell
      eyebrow={t.eyebrow}
      title={t.title}
      footer={
        /* An exit that is not "go back and try the password again". Somebody
           whose authenticator is genuinely unavailable needs a way out of this
           page that is not the browser's back button. */
        <form action={signOut}>
          <Button type="submit" variant="ghost">
            {t.signOut}
          </Button>
        </form>
      }
    >
      <AssuranceForm />
    </AuthShell>
  );
}
