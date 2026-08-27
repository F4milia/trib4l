import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { blockMember, unblockMember } from "@/app/actions/member-safety";
import { Button, Card, PageHeader } from "@/components/ui";

export default async function CommunityMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { slug } = await params;
  const { notice } = await searchParams;
  const { supabase, user } = await requireUser();

  const orgs = await getUserOrgs(supabase, user.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  if (!currentOrg) redirect("/");

  const { data: ownMembership } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", currentOrg.org_id)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  const { data: members } = await supabase
    .from("memberships")
    .select("id, role, profiles(display_name)")
    .eq("org_id", currentOrg.org_id)
    .order("created_at");

  const { data: myBlocks } = ownMembership
    ? await supabase.from("member_blocks").select("blocked_membership_id").eq("blocker_membership_id", ownMembership.id)
    : { data: [] };
  const blockedMembershipIds = new Set((myBlocks ?? []).map((b) => b.blocked_membership_id));

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="Members" />
      <p className="text-sm text-deep-slate/70">
        Blocking or reporting here only applies within this community. To block someone everywhere on the
        platform instead, use the block option on their posts.
      </p>
      {notice ? <p className="text-sm text-baked-clay">{notice}</p> : null}
      <Card>
        <ul className="divide-y divide-deep-slate/15">
          {members?.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <span>{m.profiles?.display_name}</span>
                <span className="ml-2 text-sm text-deep-slate/70">{m.role}</span>
              </div>
              {ownMembership && m.id !== ownMembership.id && (
                <div className="flex items-center gap-2">
                  {blockedMembershipIds.has(m.id) ? (
                    <form action={unblockMember}>
                      <input type="hidden" name="org_id" value={currentOrg.org_id} />
                      <input type="hidden" name="org_slug" value={slug} />
                      <input type="hidden" name="blocked_membership_id" value={m.id} />
                      <Button type="submit" variant="ghost">
                        Unblock
                      </Button>
                    </form>
                  ) : (
                    <>
                      <form action={blockMember}>
                        <input type="hidden" name="org_id" value={currentOrg.org_id} />
                        <input type="hidden" name="org_slug" value={slug} />
                        <input type="hidden" name="blocked_membership_id" value={m.id} />
                        <Button type="submit" variant="ghost">
                          Block
                        </Button>
                      </form>
                      <Link
                        href={`/o/${slug}/members/report?membership_id=${m.id}`}
                        className="text-xs text-deep-slate/70 underline"
                      >
                        Report
                      </Link>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
