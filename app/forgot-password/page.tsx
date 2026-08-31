import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button, Input, Label } from "@/components/ui";
import { copy } from "@/lib/copy";

const t = copy.auth.forgotPassword;

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthShell
      eyebrow={t.eyebrow}
      title={t.title}
      error={error}
      footer={
        <Link href="/login" className="text-terracotta underline">
          {t.back}
        </Link>
      }
    >
      <form action={requestPasswordReset} className="space-y-5">
        <p className="text-sm text-deep-slate/70">{t.body}</p>
        <div>
          <Label htmlFor="email">{t.emailLabel}</Label>
          <Input type="email" name="email" id="email" autoComplete="email" required />
        </div>
        <Button type="submit" className="w-full">
          {t.submit}
        </Button>
      </form>
    </AuthShell>
  );
}
