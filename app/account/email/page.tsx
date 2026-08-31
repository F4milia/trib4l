import Link from "next/link";
import { requestEmailChange } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button, Input, Label, StatusText } from "@/components/ui";
import { copy } from "@/lib/copy";
import { requireUser } from "@/lib/session";

const t = copy.auth.changeEmail;

/**
 * The current address is read from the session, never from a parameter, and is
 * shown disabled rather than as editable text -- it is context, not an input.
 *
 * requireUser() is the right gate here (unlike /reset-password): someone
 * arriving signed out genuinely does need to sign in, and requireUser also
 * carries the verification branch, so an unconfirmed session cannot start a
 * change of address.
 */
export default async function ChangeEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const { user } = await requireUser();

  return (
    <AuthShell
      eyebrow={t.eyebrow}
      title={t.title}
      error={error}
      footer={
        <Link href="/" className="text-terracotta underline">
          {t.back}
        </Link>
      }
    >
      <form action={requestEmailChange} className="space-y-5">
        {sent ? <StatusText>{t.sent}</StatusText> : null}

        <div>
          <Label htmlFor="current_email">{t.currentLabel}</Label>
          <Input
            type="email"
            id="current_email"
            value={user.email ?? ""}
            disabled
            readOnly
            aria-describedby="email-change-note"
          />
        </div>

        <div>
          <Label htmlFor="email">{t.newLabel}</Label>
          <Input type="email" name="email" id="email" autoComplete="email" required />
        </div>

        <p id="email-change-note" className="text-sm text-deep-slate/70">
          {t.body}
        </p>

        <Button type="submit" className="w-full">
          {t.submit}
        </Button>
      </form>
    </AuthShell>
  );
}
