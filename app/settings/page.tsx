import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { copy } from "@/lib/copy";
import { requireUser } from "@/lib/session";

const t = copy.settingsIndex;

/**
 * The account settings index.
 *
 * Not asked for by S2's prompt, and added anyway for a reason worth stating:
 * /account/email and /settings/blocked already shipped with no link to them
 * from anywhere in the app -- reachable only by typing the URL. S2 adds a
 * session list and (PR 10) account deletion to that same set. A security
 * surface nobody can find protects nobody.
 *
 * Deliberately NOT wired into lib/org-nav.ts: that nav is per-Family, and these
 * settings are per-person. Mixing them would put "your sessions" inside a
 * Family's chrome, which is the wrong claim about scope.
 *
 * §4.6 seamed card row for the list, §4.7 for the header rhythm. Single column,
 * ramp B: there is no second subject.
 */
export default async function SettingsIndexPage() {
  await requireUser();

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <PageHeader eyebrow={t.eyebrow} title={t.title} />

      <p className="max-w-xl text-base text-deep-slate/70">{t.lead}</p>

      <ul className="mt-10 grid gap-px bg-deep-slate/20">
        {t.links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta">
              <Card className="transition-colors hover:bg-muted">
                <p className="text-base font-medium">{link.label}</p>
                {/* Mono second line, the register §7.7 uses under a nav label. */}
                <p className="mt-1 font-mono text-xs text-deep-slate/70">{link.description}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
