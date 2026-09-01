import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { listMessages, resolveMembershipId } from "@/lib/conversations";
import { copy } from "@/lib/copy";
import { ConversationRoom, type RoomMember } from "@/components/conversation-room";
import { PageHeader } from "@/components/ui";

/**
 * C1 PR 7. One open room.
 *
 * Everything here reads through the caller own Supabase client, so a
 * conversation they are not a participant of comes back empty and this renders
 * a 404 rather than an empty room. Hiding a link is navigation; the refusal is
 * the policy, and this page does not add a second one of its own.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ slug: string; conversationId: string }>;
}) {
  const { slug, conversationId } = await params;
  const { supabase, user } = await requireUser();

  const orgs = await getUserOrgs(supabase, user.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  if (!currentOrg) redirect("/");

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, org_id, kind, title")
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();

  // Not a participant, or a room belonging to another Family this member also
  // happens to be in: both are a 404 here. The second is the dual-Family case
  // and is why org_id is checked as well as visibility.
  if (!conversation || conversation.org_id !== currentOrg.org_id) notFound();

  const ownMembershipId = await resolveMembershipId(supabase, currentOrg.org_id);

  const { data: participantRows } = await supabase
    .from("conversation_participants")
    .select("membership_id, memberships(profiles(display_name))")
    .eq("conversation_id", conversationId);

  const members: RoomMember[] = (participantRows ?? []).map((row) => {
    const membership = row.memberships as { profiles: { display_name: string } | null } | null;
    return {
      membershipId: row.membership_id,
      displayName: membership?.profiles?.display_name ?? copy.conversations.unknownMember,
    };
  });

  const initialMessages = await listMessages(supabase, conversationId);

  const isFamilyChannel = conversation.kind === "family_channel";
  const title = isFamilyChannel
    ? copy.conversations.familyChannel
    : (conversation.title ??
      members
        .filter((m) => m.membershipId !== ownMembershipId)
        .map((m) => m.displayName)
        .join(", "));

  return (
    <main className="mx-auto flex h-[calc(100dvh-5rem)] max-w-3xl flex-col gap-6 px-5 py-8 sm:px-8 lg:h-dvh lg:px-12 lg:py-12">
      <div className="space-y-3">
        <Link href={`/o/${slug}/messages`} className="text-sm underline">
          {copy.conversations.backToList}
        </Link>
        <PageHeader title={title} />
      </div>

      <ConversationRoom
        orgId={currentOrg.org_id}
        conversationId={conversationId}
        ownMembershipId={ownMembershipId}
        members={members}
        initialMessages={initialMessages}
        isFamilyChannel={isFamilyChannel}
      />
    </main>
  );
}
