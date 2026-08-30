import Link from "next/link";
import { signUp } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button, Input, Label } from "@/components/ui";
import { copy } from "@/lib/copy";

const t = copy.auth.signup;

export default async function SignupPage({
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
          <Link href="/login" className="text-terracotta underline">
            {t.switchAction}
          </Link>
        </>
      }
    >
      <form action={signUp} className="space-y-5">
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
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>

        {/* §2.4's tinted-fill step over a 2px object border. deep-slate/70 on
            bg-muted measures 5.69:1 -- the composed pair, not the token, per
            CLAUDE.md's 2026-08-27 learned constraint. */}
        <div className="space-y-3 border-2 border-terracotta/40 bg-muted p-4">
          <h2 className="text-lg">{t.consent.heading}</h2>
          <p className="text-sm text-deep-slate/70">{t.consent.body}</p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="consent"
              required
              className="mt-0.5 size-4 shrink-0 accent-terracotta"
            />
            <span>{t.consent.checkbox}</span>
          </label>
        </div>

        <Button type="submit" className="w-full">
          {t.submit}
        </Button>
      </form>
    </AuthShell>
  );
}
