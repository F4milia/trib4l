import { requireUser } from "@/lib/session";
import { unblockUser } from "@/app/actions/safety";
import { Button, Card, PageHeader } from "@/components/ui";

export default async function BlockedUsersPage() {
  const { supabase } = await requireUser();

  const { data: blocks } = await supabase
    .from("blocks")
    .select("blocked_profile_id, created_at, profiles!blocks_blocked_profile_id_fkey(display_name)")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-md px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="Blocked people" />
      <p className="text-sm text-deep-slate/70">
        Applies everywhere, in every community you&apos;re part of — not just where you blocked them.
      </p>
      <Card>
        {blocks?.length ? (
          <ul className="divide-y divide-deep-slate/15">
            {blocks.map((b) => (
              <li key={b.blocked_profile_id} className="flex items-center justify-between py-2">
                <span>{b.profiles?.display_name}</span>
                <form action={unblockUser}>
                  <input type="hidden" name="blocked_profile_id" value={b.blocked_profile_id} />
                  <Button type="submit" variant="ghost">
                    Unblock
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-deep-slate/70">You haven&apos;t blocked anyone.</p>
        )}
      </Card>
    </main>
  );
}
