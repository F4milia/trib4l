import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { createStage, transitionMemberStage } from "@/app/actions/stages";
import { Button, Card, ErrorText, Input, Label, PageHeader, Select } from "@/components/ui";

export default async function StagesSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireUser();

  const orgs = await getUserOrgs(supabase, (await supabase.auth.getUser()).data.user!.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  if (!currentOrg || (currentOrg.role !== "organizer" && currentOrg.role !== "org_owner")) {
    redirect(`/o/${slug}`);
  }

  const { data: stages } = await supabase
    .from("stages")
    .select("id, name, sort_order")
    .eq("org_id", currentOrg.org_id)
    .order("sort_order");

  const { data: members } = await supabase
    .from("memberships")
    .select("profile_id, role, profiles(display_name)")
    .eq("org_id", currentOrg.org_id)
    .order("created_at");

  const { data: memberStages } = await supabase
    .from("member_stages")
    .select("profile_id, stage_id")
    .eq("org_id", currentOrg.org_id)
    .is("deleted_at", null);

  const stageByProfile = new Map((memberStages ?? []).map((ms) => [ms.profile_id, ms.stage_id]));
  const stageNameById = new Map((stages ?? []).map((s) => [s.id, s.name]));

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-8">
      <PageHeader title="Stages" />
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        <h2 className="mb-3 text-xl">Existing stages, in order</h2>
        {stages?.length ? (
          <ul className="divide-y divide-deep-slate/15">
            {stages.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span>{s.name}</span>
                <span className="text-deep-slate/70 text-sm">order {s.sort_order}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-deep-slate/70">None yet.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Create a stage</h2>
        <form action={createStage} className="flex items-end gap-3">
          <input type="hidden" name="org_id" value={currentOrg.org_id} />
          <input type="hidden" name="org_slug" value={slug} />
          <div className="flex-1">
            <Label htmlFor="stage-name">Name</Label>
            <Input type="text" name="name" id="stage-name" required />
          </div>
          <div>
            <Label htmlFor="stage-sort-order">Order</Label>
            <Input type="number" name="sort_order" id="stage-sort-order" required className="w-24" />
          </div>
          <Button type="submit">Create</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Move members between stages</h2>
        {!stages?.length ? (
          <p className="text-deep-slate/70">Create a stage first.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-deep-slate/20 text-deep-slate/70">
                <th className="py-2 font-medium">Member</th>
                <th className="py-2 font-medium">Current stage</th>
                <th className="py-2 font-medium">Move to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deep-slate/15">
              {members?.map((m) => (
                <tr key={m.profile_id}>
                  <td className="py-2">{m.profiles?.display_name}</td>
                  <td className="py-2 text-deep-slate/70">
                    {stageByProfile.has(m.profile_id)
                      ? stageNameById.get(stageByProfile.get(m.profile_id)!) ?? "—"
                      : "—"}
                  </td>
                  <td className="py-2">
                    <form action={transitionMemberStage} className="flex items-center gap-2">
                      <input type="hidden" name="org_id" value={currentOrg.org_id} />
                      <input type="hidden" name="org_slug" value={slug} />
                      <input type="hidden" name="profile_id" value={m.profile_id} />
                      <Select name="stage_id" defaultValue="" className="max-w-40">
                        <option value="" disabled>
                          Choose a stage
                        </option>
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit">Move</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
