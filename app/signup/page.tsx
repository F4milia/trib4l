import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { OAuthButtons } from "@/components/oauth-buttons";
import { copy } from "@/lib/copy";

const t = copy.auth.signup;

export default function SignupPage() {
  return (
    <AuthShell
      eyebrow={t.eyebrow}
      title={t.title}
      footer={
        <>
          {t.switchPrompt}{" "}
          <Link href="/login" className="text-terracotta underline">
            {t.switchAction}
          </Link>
        </>
      }
    >
      {/* No searchParams: nothing redirects to /signup?error= any more. Every
          failure this form can produce is returned to it as state, and a
          message that survives in the URL after a corrected submission is a
          message that outlives the problem it described. */}
      <SignupForm />

      <OAuthButtons />
    </AuthShell>
  );
}
