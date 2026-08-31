import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { copy } from "@/lib/copy";

const t = copy.auth.linkSent;

/**
 * Reached whether or not the address has an account, and showing the same
 * thing either way. The form behind it does not create accounts, so the copy
 * is conditional on purpose: a definite "we sent you a link" would be a claim
 * this page cannot make, and a definite "no such account" would answer a
 * question a stranger should not get to ask.
 *
 * Shows no address, and takes no query parameter, for the same reason
 * /check-email does not: it is reachable by URL, so anything it echoed would
 * be attacker-supplied.
 */
export default function LinkSentPage() {
  return (
    <AuthShell
      eyebrow={t.eyebrow}
      title={t.title}
      footer={
        <>
          <Link href="/login" className="text-terracotta underline">
            {t.back}
          </Link>
          {" · "}
          {t.switchPrompt}{" "}
          <Link href="/signup" className="text-terracotta underline">
            {t.switchAction}
          </Link>
        </>
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
