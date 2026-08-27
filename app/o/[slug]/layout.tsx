import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { copy } from "@/lib/copy";
import { orgNav } from "@/lib/org-nav";
import { getUserOrgs, requireUser } from "@/lib/session";
import { OrgNav } from "./org-nav";
import { OrgSwitcher } from "./org-switcher";

/**
 * §4.5's app shell: a w-72 fixed sidebar on ink-bordered parchment, content
 * offset by lg:pl-72, and an h-20 mobile header.
 *
 * Mobile navigation is a native <details> disclosure rather than a scripted
 * drawer. §4.5 gives the mobile header a height but never says what opens
 * from it, and the disclosure keeps this file a server component: it is
 * keyboard-operable with no JS, and the role-gated sections never have to
 * cross into client state where they could be re-derived. Only OrgNav is a
 * client component, and only to read the pathname.
 *
 * The content wrapper adds no padding on purpose -- every page already
 * carries its own `mx-auto max-w-* px-4 py-10` container. §4.3's page padding
 * ramp lands per surface in C2 onward, not here, so this PR cannot
 * double-pad anything.
 */
export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { supabase, user } = await requireUser();

  const orgs = await getUserOrgs(supabase, user.id);
  const currentOrg = orgs.find((o) => o.slug === slug);

  if (!currentOrg) {
    // Either the org doesn't exist, or -- indistinguishable on purpose,
    // per Invariant 1 -- the caller isn't a member of it.
    const { data: exists } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
    if (!exists) notFound();
    redirect("/");
  }

  // Role comes from the server-resolved membership, never a client claim
  // (invariant 5). orgNav only formats that decision; RLS enforces access.
  const sections = orgNav(slug, currentOrg.role);
  const options = orgs.map((o) => ({ slug: o.slug, name: o.name }));

  const allCommunities = (
    <Link
      href="/"
      className="block font-mono text-[10px] font-black uppercase tracking-widest text-deep-slate/70 transition-colors hover:text-terracotta"
    >
      {copy.orgNav.items.allCommunities.label}
    </Link>
  );

  return (
    <div className="min-h-screen lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 flex-col border-r-2 border-deep-slate bg-parchment lg:flex">
        <p className="flex h-24 shrink-0 items-center border-b-2 border-deep-slate px-3 font-serif text-2xl font-black uppercase tracking-tighter">
          {copy.brand.wordmark}
        </p>
        <div className="shrink-0 border-b border-deep-slate/15 px-3 py-4">
          <OrgSwitcher current={slug} orgs={options} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <OrgNav sections={sections} />
        </div>
        <div className="shrink-0 border-t-2 border-deep-slate px-3 py-4">{allCommunities}</div>
      </aside>

      <details className="sticky top-0 z-20 border-b-2 border-deep-slate bg-parchment lg:hidden">
        <summary className="flex h-20 cursor-pointer list-none items-center justify-between px-5">
          <span className="font-serif text-2xl font-black uppercase tracking-tighter">{copy.brand.wordmark}</span>
          <span className="stamp">{copy.orgNav.mobileMenu}</span>
        </summary>
        <div className="border-t-2 border-deep-slate">
          <div className="border-b border-deep-slate/15 px-3 py-4">
            <OrgSwitcher current={slug} orgs={options} />
          </div>
          <OrgNav sections={sections} />
          <div className="border-t-2 border-deep-slate px-3 py-4">{allCommunities}</div>
        </div>
      </details>

      {children}
    </div>
  );
}
