import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { listConversations, unreadCounts } from "@/lib/conversations";
import { copy } from "@/lib/copy";
import { Card, PageHeader, Stamp } from "@/components/ui";

/**
 * C1 PR 7. The conversation list for one Family.
 *
 * A list surface, so no two-column split -- design system 4.6: the rhythm
 * comes from the rows. The Family channel is pinned first because it is the
 * one room everybody shares; direct messages follow under their own rule.
 */
export default async function MessagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { supabase, user } = await requireUser();

  const orgs = await getUserOrgs(supabase, user.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  if (!currentOrg) redirect("/");

  // Both go through the caller own client, so RLS decides what comes back.
  const [conversations, unread] = await Promise.all([
    listConversations(supabase, currentOrg.org_id),
    unreadCounts(supabase, currentOrg.org_id),
  ]);

  const channel = conversations.find((c) => c.kind === "family_channel");
  const directs = conversations.filter((c) => c.kind === "direct");

  // Resolved once here rather than per row: a DM is named after the people in
  // it, and the participant rows come back scoped by the same policy.
  const { data: participantRows } = await supabase
    .from("conversation_participants")
    .select("conversation_id, membership_id, memberships(profile_id, profiles(display_name))")
    .in("conversation_id", directs.length > 0 ? directs.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"]);

  const namesByConversation = new Map<string, string[]>();
  for (const row of participantRows ?? []) {
    const membership = row.memberships as { profile_id: string; profiles: { display_name: string } | null } | null;
    if (!membership || membership.profile_id === user.id) continue;
    const list = namesByConversation.get(row.conversation_id) ?? [];
    list.push(membership.profiles?.display_name ?? copy.conversations.unknownMember);
    namesByConversation.set(row.conversation_id, list);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <PageHeader title={copy.conversations.heading} />

      {channel ? (
        <Card>
          <Link
            href={`/o/${slug}/messages/${channel.id}`}
            className="flex items-center justify-between gap-3"
          >
            <span>
              <span className="block text-lg">{copy.conversations.familyChannel}</span>
              <span className="block text-sm text-deep-slate/70">
                {copy.conversations.familyChannelDescription}
              </span>
            </span>
            {(unread.get(channel.id) ?? 0) > 0 ? (
              <Stamp>{copy.conversations.unreadLabel(unread.get(channel.id) ?? 0)}</Stamp>
            ) : null}
          </Link>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="border-b-2 border-deep-slate pb-3 text-lg">
          {copy.conversations.directHeading}
        </h2>

        {directs.length === 0 ? (
          <p className="text-sm text-deep-slate/70">{copy.conversations.noDirects}</p>
        ) : (
          <ul className="divide-y divide-deep-slate/15">
            {directs.map((conversation) => {
              const count = unread.get(conversation.id) ?? 0;
              const names = namesByConversation.get(conversation.id) ?? [];
              return (
                <li key={conversation.id}>
                  <Link
                    href={`/o/${slug}/messages/${conversation.id}`}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <span>{conversation.title ?? names.join(", ")}</span>
                    {count > 0 ? <Stamp>{copy.conversations.unreadLabel(count)}</Stamp> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
