import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/oauth-buttons";
import { copy } from "@/lib/copy";

const t = copy.auth.login;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthShell
      eyebrow={t.eyebrow}
      title={t.title}
      footer={
        <>
          {t.switchPrompt}{" "}
          <Link href="/signup" className="text-terracotta underline">
            {t.switchAction}
          </Link>
        </>
      }
    >
      {/* The query error goes to the form, not to AuthShell. /auth/confirm and
          /auth/callback both redirect here carrying one, and it stays in the
          URL across a submission -- rendered separately it would sit above a
          second, contradicting message. Seeded as the form's initial state,
          the next submission replaces it. */}
      <LoginForm initialError={error} />

      <OAuthButtons />

      {/* Outside the <form>: a link inside it that looked like a second
          submit would be a keyboard trap of the confusing kind — Enter in the
          password field must submit the password, not navigate away. */}
      <p className="mt-5 border-t border-deep-slate/20 pt-5 text-sm text-deep-slate/70">
        {t.magicLinkPrompt}{" "}
        <Link href="/magic-link" className="text-terracotta underline">
          {t.magicLinkAction}
        </Link>
        {" · "}
        <Link href="/forgot-password" className="text-terracotta underline">
          {t.forgotAction}
        </Link>
      </p>
    </AuthShell>
  );
}
