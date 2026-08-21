import { redirect } from "next/navigation";
import { requireUser, getUserOrgs } from "@/lib/session";
import { createCohort, assignToCohort } from "@/app/actions/cohorts";

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
    <main>
      <h1>Cohorts</h1>
      {error ? <p role="alert">{error}</p> : null}

      <section>
        <h2>Existing cohorts</h2>
        {cohorts?.length ? (
          <ul>
            {cohorts.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        ) : (
          <p>None yet.</p>
        )}
      </section>

      <section>
        <h2>Create a cohort</h2>
        <form action={createCohort}>
          <input type="hidden" name="org_id" value={currentOrg.org_id} />
          <input type="hidden" name="org_slug" value={slug} />
          <label>
            Name
            <input type="text" name="name" required />
          </label>
          <button type="submit">Create</button>
        </form>
      </section>

      <section>
        <h2>Assign members</h2>
        {!cohorts?.length ? (
          <p>Create a cohort first.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Current cohort</th>
                <th>Move to</th>
              </tr>
            </thead>
            <tbody>
              {members?.map((m) => (
                <tr key={m.profile_id}>
                  <td>{m.profiles?.display_name}</td>
                  <td>
                    {cohortByProfile.has(m.profile_id)
                      ? cohortNameById.get(cohortByProfile.get(m.profile_id)!) ?? "—"
                      : "—"}
                  </td>
                  <td>
                    <form action={assignToCohort}>
                      <input type="hidden" name="org_id" value={currentOrg.org_id} />
                      <input type="hidden" name="org_slug" value={slug} />
                      <input type="hidden" name="profile_id" value={m.profile_id} />
                      <select name="cohort_id" defaultValue="">
                        <option value="" disabled>
                          Choose a cohort
                        </option>
                        {cohorts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit">Assign</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
