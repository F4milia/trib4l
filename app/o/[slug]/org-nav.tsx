"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/copy";
import type { OrgNavSection } from "@/lib/org-nav";
import { cn } from "@/lib/utils";

/**
 * §7.7's navigation item. Active = terracotta left rule + full ink fill
 * inversion; hover = ochre rule + 20% ochre wash.
 *
 * This is a client component for one reason: `usePathname` decides which item
 * is current. It receives `sections` already built -- orgNav() runs on the
 * server against the server-resolved membership role (invariant 5), and this
 * component never decides what a role may see. It renders exactly what it is
 * handed. Role gating is tested in tests/org-nav.test.ts, not here.
 *
 * Descriptions ship at text-deep-slate/70, not §7.7's text-deep-slate/45:
 * /45 measures 2.83:1 on parchment and CLAUDE.md requires AA at rendered
 * size. /70 measures 6.18:1. On the inverted active item the equivalent is
 * text-parchment/70 (8.32:1).
 *
 * Icons are deliberately absent. §7.7 shows one per item and §10 gives the
 * sizes, but choosing 19 of them is a design decision per item rather than an
 * implementation detail -- deferred rather than invented.
 */
export function OrgNav({ sections, className }: { sections: OrgNavSection[]; className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={copy.orgNav.landmark} className={cn("flex flex-col", className)}>
      {sections.map((section) => (
        <div key={section.id} className="border-b border-deep-slate/15 py-4 last:border-b-0">
          {section.heading ? (
            <p className="mb-2 px-3 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-deep-slate/70">
              {section.heading}
            </p>
          ) : null}
          <ul>
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block border-l-2 px-3 py-3 transition-colors",
                      active
                        ? "border-terracotta bg-deep-slate text-parchment"
                        : "border-transparent text-deep-slate hover:border-hearth-ochre hover:bg-hearth-ochre/20",
                    )}
                  >
                    <span className="block font-serif text-base font-semibold">{item.label}</span>
                    <span
                      className={cn(
                        "block font-mono text-[10px] uppercase tracking-wider",
                        active ? "text-parchment/70" : "text-deep-slate/70",
                      )}
                    >
                      {item.description}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
