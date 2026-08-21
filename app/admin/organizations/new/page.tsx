import { requirePlatformAdmin } from "@/lib/session";
import { createOrganization } from "@/app/actions/organizations";
import { Button, Card, ErrorText, Input, Label, PageHeading } from "@/components/ui";

export default async function NewOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePlatformAdmin();
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-md px-4 py-10 space-y-6">
      <div>
        <PageHeading>New organization</PageHeading>
        <p className="mt-1 text-sm text-ink-soft">
          platform_admin only. Optionally send the first org_owner invitation immediately.
        </p>
      </div>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Card>
        <form action={createOrganization} className="space-y-4">
          <div>
            <Label htmlFor="org-name">Name</Label>
            <Input type="text" name="name" id="org-name" required />
          </div>
          <div>
            <Label htmlFor="org-slug">Slug (leave blank to derive from name)</Label>
            <Input type="text" name="slug" id="org-slug" />
          </div>
          <div>
            <Label htmlFor="owner-email">Initial owner&apos;s email (optional)</Label>
            <Input type="email" name="owner_email" id="owner-email" />
          </div>
          <Button type="submit" className="w-full">
            Create organization
          </Button>
        </form>
      </Card>
    </main>
  );
}
