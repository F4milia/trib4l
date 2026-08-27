import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { createCohort, assignToCohort } from "@/app/actions/cohorts";
import { Button, Card, ErrorText, Input, Label, PageHeader, Select } from "@/components/ui";

export default async function CohortsSettingsPage({
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

  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name")
    .eq("org_id", currentOrg.org_id)
    .order("created_at");

  const { data: members } = await supabase
    .from("memberships")
    .select("profile_id, role, profiles(display_name)")
    .eq("org_id", currentOrg.org_id)
    .order("created_at");

  const { data: cohortMembers } = await supabase
    .from("cohort_members")
    .select("profile_id, cohort_id")
    .eq("org_id", currentOrg.org_id)
    .is("deleted_at", null);

  const cohortByProfile = new Map((cohortMembers ?? []).map((cm) => [cm.profile_id, cm.cohort_id]));
  const cohortNameById = new Map((cohorts ?? []).map((c) => [c.id, c.name]));

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-8">
      <PageHeader title="Cohorts" />
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        <h2 className="mb-3 text-xl">Existing cohorts</h2>
        {cohorts?.length ? (
          <ul className="divide-y divide-deep-slate/15">
            {cohorts.map((c) => (
              <li key={c.id} className="py-2">
                {c.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-deep-slate/70">None yet.</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Create a cohort</h2>
        <form action={createCohort} className="flex items-end gap-3">
          <input type="hidden" name="org_id" value={currentOrg.org_id} />
          <input type="hidden" name="org_slug" value={slug} />
          <div className="flex-1">
            <Label htmlFor="cohort-name">Name</Label>
            <Input type="text" name="name" id="cohort-name" required />
          </div>
          <Button type="submit">Create</Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-xl">Assign members</h2>
        {!cohorts?.length ? (
          <p className="text-deep-slate/70">Create a cohort first.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-deep-slate/20 text-deep-slate/70">
                <th className="py-2 font-medium">Member</th>
                <th className="py-2 font-medium">Current cohort</th>
                <th className="py-2 font-medium">Move to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deep-slate/15">
              {members?.map((m) => (
                <tr key={m.profile_id}>
                  <td className="py-2">{m.profiles?.display_name}</td>
                  <td className="py-2 text-deep-slate/70">
                    {cohortByProfile.has(m.profile_id)
                      ? cohortNameById.get(cohortByProfile.get(m.profile_id)!) ?? "—"
                      : "—"}
                  </td>
                  <td className="py-2">
                    <form action={assignToCohort} className="flex items-center gap-2">
                      <input type="hidden" name="org_id" value={currentOrg.org_id} />
                      <input type="hidden" name="org_slug" value={slug} />
                      <input type="hidden" name="profile_id" value={m.profile_id} />
                      <Select name="cohort_id" defaultValue="" className="max-w-40">
                        <option value="" disabled>
                          Choose a cohort
                        </option>
                        {cohorts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit">Assign</Button>
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
