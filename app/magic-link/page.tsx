import Link from "next/link";
import { sendMagicLink } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button, Input, Label } from "@/components/ui";
import { copy } from "@/lib/copy";

const t = copy.auth.magicLink;

/**
 * A page of its own rather than a second submit button on /login.
 *
 * The alternative -- one email field with two `formAction` buttons -- reads
 * tidier but is worse in the places that matter: the password field is
 * `required`, so the link button needs `formNoValidate`, which disables the
 * email validation too; and a second `button[type="submit"]` on /login makes
 * every existing e2e selector positional. One field, one action, one page.
 */
export default async function MagicLinkPage({
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
      <form action={sendMagicLink} className="space-y-5">
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
