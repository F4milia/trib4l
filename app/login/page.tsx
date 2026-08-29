import Link from "next/link";
import { signIn } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button, Input, Label } from "@/components/ui";
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
      error={error}
      footer={
        <>
          {t.switchPrompt}{" "}
          <Link href="/signup" className="text-terracotta underline">
            {t.switchAction}
          </Link>
        </>
      }
    >
      <form action={signIn} className="space-y-5">
        <div>
          <Label htmlFor="email">{t.emailLabel}</Label>
          <Input type="email" name="email" id="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">{t.passwordLabel}</Label>
          <Input
            type="password"
            name="password"
            id="password"
            autoComplete="current-password"
            required
          />
        </div>
        <Button type="submit" className="w-full">
          {t.submit}
        </Button>
      </form>

      {/* Outside the <form>: a link inside it that looked like a second
          submit would be a keyboard trap of the confusing kind — Enter in the
          password field must submit the password, not navigate away. */}
      <p className="mt-5 border-t border-deep-slate/20 pt-5 text-sm text-deep-slate/70">
        {t.magicLinkPrompt}{" "}
        <Link href="/magic-link" className="text-terracotta underline">
          {t.magicLinkAction}
        </Link>
      </p>
    </AuthShell>
  );
}
