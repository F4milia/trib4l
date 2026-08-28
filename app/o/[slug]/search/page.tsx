import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { Card, Input, PageHeader } from "@/components/ui";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  const { supabase } = await requireUser();

  const { data: org } = await supabase.from("organizations").select("id").eq("slug", slug).single();
  // RLS hides an org from a non-member, so this returns null both for "does not
  // exist" and for "exists, you are not in it" -- indistinguishable on purpose
  // (invariant 1).
  //
  // Defence in depth, not a user-visible fix: the layout's notFound() already
  // answers 404 for every route under /o/[slug], verified by reverting this
  // guard and watching tests/e2e/dual-family.spec.ts stay green. What it does
  // remove is a real server-side exception -- this page previously read
  // `org!.id` and threw on every non-member request, logged and swallowed
  // because the layout won the race. A page should not depend on a
  // parallel-rendered layout for its own null-safety.
  if (!org) notFound();

  // RLS applies here exactly as it does to the feed -- a search can never
  // surface a cohort post to someone outside that cohort, since
  // .textSearch() is just another filter on top of the same SELECT policy.
  const [postResults, commentResults] = q
    ? await Promise.all([
        supabase
          .from("posts")
          .select("id, body, created_at, profiles(display_name)")
          .eq("org_id", org.id ?? "")
          .is("deleted_at", null)
          .textSearch("search_vector", q, { type: "websearch" }),
        supabase
          .from("comments")
          .select("id, post_id, body, created_at, profiles(display_name)")
          .eq("org_id", org.id ?? "")
          .is("deleted_at", null)
          .textSearch("search_vector", q, { type: "websearch" }),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-6">
      <PageHeader title="Search" />
      <form className="flex gap-2">
        <Input type="search" name="q" defaultValue={q ?? ""} placeholder="Search posts and comments..." />
      </form>

      {q ? (
        <div className="space-y-4">
          <div>
            <h2 className="mb-2 text-lg text-deep-slate/70">Posts</h2>
            {postResults.data?.length ? (
              <div className="space-y-2">
                {postResults.data.map((p) => (
                  <Card key={p.id}>
                    <p className="text-sm text-deep-slate/70">{p.profiles?.display_name}</p>
                    <p>{p.body}</p>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-deep-slate/70 text-sm">No matching posts.</p>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-lg text-deep-slate/70">Comments</h2>
            {commentResults.data?.length ? (
              <div className="space-y-2">
                {commentResults.data.map((c) => (
                  <Card key={c.id}>
                    <p className="text-sm text-deep-slate/70">{c.profiles?.display_name}</p>
                    <p>{c.body}</p>
                    <Link href={`/o/${slug}`} className="text-sm text-terracotta underline">
                      View in feed
                    </Link>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-deep-slate/70 text-sm">No matching comments.</p>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
