import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { copy } from "@/lib/copy";

const t = copy.auth.checkEmail;

/**
 * Where signup lands now that confirmation is mandatory. It deliberately shows
 * no address and takes no query parameter: the page is reachable by URL, so
 * anything it echoed would be attacker-supplied, and reflecting an address
 * back would also confirm to a stranger that it was accepted.
 */
export default function CheckEmailPage() {
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
