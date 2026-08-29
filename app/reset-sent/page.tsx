import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { copy } from "@/lib/copy";

const t = copy.auth.resetSent;

/**
 * Reached whether or not the address has an account, and identical either way
 * -- the same reason /link-sent is. Separate from it because the copy has to
 * be true: this is a password link, not a sign-in link, and telling someone
 * their current password still works is the reassurance this page owes them.
 */
export default function ResetSentPage() {
  return (
    <AuthShell
      eyebrow={t.eyebrow}
      title={t.title}
      footer={
        <Link href="/login" className="text-terracotta underline">
          {t.back}
        </Link>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-deep-slate/70">{t.body}</p>
        <p className="border-l-2 border-terracotta pl-4 font-mono text-[10px] uppercase leading-5 tracking-widest text-deep-slate/70">
          {t.note}
        </p>
      </div>
    </AuthShell>
  );
}
