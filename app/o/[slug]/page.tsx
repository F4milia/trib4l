import { createClient } from "@/lib/supabase/server";
import { PageHeading } from "@/components/ui";

export default async function OrgHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("slug", slug)
    .single();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-2">
      <PageHeading>{org?.name}</PageHeading>
      <p className="text-ink-soft">Welcome. Community features land in later sessions.</p>
    </main>
  );
}
