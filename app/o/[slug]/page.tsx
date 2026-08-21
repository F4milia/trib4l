import { requireUser, getUserOrgs } from "@/lib/session";
import { createPost, createComment, toggleLike, moderatePost, moderateComment } from "@/app/actions/posts";
import { Button, Card, ErrorText, PageHeading, Select } from "@/components/ui";

export default async function OrgHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { supabase, user } = await requireUser();

  const orgs = await getUserOrgs(supabase, user.id);
  const currentOrg = orgs.find((o) => o.slug === slug);
  const isStaff = currentOrg?.role === "organizer" || currentOrg?.role === "org_owner";

  const { data: org } = await supabase.from("organizations").select("id, name").eq("slug", slug).single();
  const orgId = org!.id;

  // What can this person post into, besides org-wide? Staff get every
  // cohort (announcements); a regular member only their own, if any.
  let postableCohorts: { id: string; name: string }[] = [];
  if (isStaff) {
    const { data } = await supabase.from("cohorts").select("id, name").eq("org_id", orgId).order("name");
    postableCohorts = data ?? [];
  } else {
    const { data: myCohortRow } = await supabase
      .from("cohort_members")
      .select("cohorts(id, name)")
      .eq("org_id", orgId)
      .eq("profile_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (myCohortRow?.cohorts) postableCohorts = [myCohortRow.cohorts];
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("id, body, created_at, cohort_id, author_profile_id, profiles(display_name), cohorts(name)")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const postIds = (posts ?? []).map((p) => p.id);

  const { data: comments } = postIds.length
    ? await supabase
        .from("comments")
        .select("id, post_id, body, created_at, author_profile_id, profiles(display_name)")
        .in("post_id", postIds)
        .is("deleted_at", null)
        .order("created_at")
    : { data: [] };

  const { data: reactions } = postIds.length
    ? await supabase.from("reactions").select("post_id, profile_id").in("post_id", postIds)
    : { data: [] };

  const commentsByPost = new Map<string, typeof comments>();
  for (const c of comments ?? []) {
    commentsByPost.set(c.post_id, [...(commentsByPost.get(c.post_id) ?? []), c]);
  }
  const likeCountByPost = new Map<string, number>();
  const likedByMeByPost = new Set<string>();
  for (const r of reactions ?? []) {
    if (!r.post_id) continue; // this feed only reacts to posts, never comments
    likeCountByPost.set(r.post_id, (likeCountByPost.get(r.post_id) ?? 0) + 1);
    if (r.profile_id === user.id) likedByMeByPost.add(r.post_id);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <PageHeading>{org?.name}</PageHeading>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card>
        <form action={createPost} className="space-y-3">
          <input type="hidden" name="org_id" value={orgId} />
          <input type="hidden" name="org_slug" value={slug} />
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Share something with the community..."
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-soft focus:border-primary focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <Select name="cohort_id" defaultValue="" className="max-w-56">
              <option value="">Org-wide</option>
              {postableCohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button type="submit">Post</Button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        {(posts ?? []).length === 0 ? (
          <p className="text-ink-soft">Nothing here yet.</p>
        ) : (
          (posts ?? []).map((post) => (
            <Card key={post.id}>
              <div className="flex items-center justify-between text-sm text-ink-soft">
                <span>
                  {post.profiles?.display_name}
                  {post.cohorts ? ` · ${post.cohorts.name}` : ""}
                </span>
                <span>{new Date(post.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{post.body}</p>

              <div className="mt-3 flex items-center gap-3">
                <form action={toggleLike}>
                  <input type="hidden" name="post_id" value={post.id} />
                  <input type="hidden" name="org_slug" value={slug} />
                  <Button type="submit" variant={likedByMeByPost.has(post.id) ? "primary" : "ghost"}>
                    ♥ {likeCountByPost.get(post.id) ?? 0}
                  </Button>
                </form>
                {isStaff && (
                  <form action={moderatePost}>
                    <input type="hidden" name="post_id" value={post.id} />
                    <input type="hidden" name="org_slug" value={slug} />
                    <Button type="submit" variant="danger">
                      Remove
                    </Button>
                  </form>
                )}
              </div>

              <div className="mt-4 space-y-2 border-t border-line pt-3">
                {(commentsByPost.get(post.id) ?? []).map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                    <p>
                      <span className="font-medium">{c.profiles?.display_name}</span>: {c.body}
                    </p>
                    {isStaff && (
                      <form action={moderateComment}>
                        <input type="hidden" name="comment_id" value={c.id} />
                        <input type="hidden" name="org_slug" value={slug} />
                        <button type="submit" className="text-danger text-xs whitespace-nowrap">
                          remove
                        </button>
                      </form>
                    )}
                  </div>
                ))}
                <form action={createComment} className="flex items-center gap-2 pt-2">
                  <input type="hidden" name="post_id" value={post.id} />
                  <input type="hidden" name="org_slug" value={slug} />
                  <input
                    type="text"
                    name="body"
                    required
                    placeholder="Write a comment..."
                    className="flex-1 rounded-md border border-line bg-white px-3 py-1.5 text-sm placeholder:text-ink-soft focus:border-primary focus:outline-none"
                  />
                  <Button type="submit" variant="ghost">
                    Reply
                  </Button>
                </form>
              </div>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
