import { requirePlatformAdmin } from "@/lib/session";
import { createOrganization } from "@/app/actions/organizations";

export default async function NewOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePlatformAdmin();
  const { error } = await searchParams;

  return (
    <main>
      <h1>New organization</h1>
      <p>platform_admin only. Optionally send the first org_owner invitation immediately.</p>
      {error ? <p role="alert">{error}</p> : null}
      <form action={createOrganization}>
        <label>
          Name
          <input type="text" name="name" required />
        </label>
        <label>
          Slug (leave blank to derive from name)
          <input type="text" name="slug" />
        </label>
        <label>
          Initial owner&apos;s email (optional)
          <input type="email" name="owner_email" />
        </label>
        <button type="submit">Create organization</button>
      </form>
    </main>
  );
}
