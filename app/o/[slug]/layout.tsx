import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { OrgSwitcher } from "./org-switcher";

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

  return (
    <div>
      <nav>
        <OrgSwitcher current={slug} orgs={orgs.map((o) => ({ slug: o.slug, name: o.name }))} />
        {" | "}
        <Link href={`/o/${slug}`}>Home</Link>
        {(currentOrg.role === "organizer" || currentOrg.role === "org_owner") && (
          <>
            {" | "}
            <Link href={`/o/${slug}/settings/members`}>Members</Link>
            {" | "}
            <Link href={`/o/${slug}/settings/cohorts`}>Cohorts</Link>
          </>
        )}
        {" | "}
        <Link href="/">All communities</Link>
      </nav>
      <hr />
      {children}
    </div>
  );
}
