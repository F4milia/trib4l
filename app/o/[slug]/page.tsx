import { createClient } from "@/lib/supabase/server";

export default async function OrgHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("slug", slug)
    .single();

  return (
    <main>
      <h1>{org?.name}</h1>
      <p>Welcome. Community features land in later sessions.</p>
    </main>
  );
}
