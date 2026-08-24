import Link from "next/link";
import { requireUser, getUserOrgs } from "@/lib/session";
import { createPost, createComment, toggleLike, moderatePost, moderateComment } from "@/app/actions/posts";
import { blockUser } from "@/app/actions/safety";
import { Button, Card, ErrorText, PageHeading, Select } from "@/components/ui";

export default async function OrgHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { slug } = await params;
  const { error, notice } = await searchParams;
  const { supabase, user } = await requireUser();

  const { data: myBlocks } = await supabase.from("blocks").select("blocked_profile_id");
  const blockedIds = new Set((myBlocks ?? []).map((b) => b.blocked_profile_id));

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

  // Only staff create stages (Session 8), so only staff get to gate a post
  // behind one -- a regular member has no stages to choose from here.
  let orgStages: { id: string; name: string }[] = [];
  if (isStaff) {
    const { data } = await supabase.from("stages").select("id, name").eq("org_id", orgId).order("sort_order");
    orgStages = data ?? [];
  }

  // Any member's own ready, approved video not yet attached to a post --
  // both conditions matter: an in-progress upload isn't attachable yet,
  // and a video already used by another post can't be reused (one video
  // per post, enforced by a unique index).
  const { data: myReadyVideos } = await supabase
    .from("video_assets")
    .select("id, duration_seconds")
    .eq("uploader_profile_id", user.id)
    .eq("status", "ready")
    .eq("moderation_state", "approved")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const { data: attachedVideoRows } = await supabase.from("posts").select("video_asset_id").eq("author_profile_id", user.id);
  const attachedVideoIds = new Set((attachedVideoRows ?? []).map((r) => r.video_asset_id).filter(Boolean));
  const attachableVideos = (myReadyVideos ?? []).filter((v) => !attachedVideoIds.has(v.id));

  const { data: allPosts } = await supabase
    .from("posts")
    .select(
      "id, body, created_at, cohort_id, author_profile_id, video_asset_id, profiles(display_name), cohorts(name), stages(name)",
    )
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Blocking is a personal viewing preference, not a tenant-isolation
  // concern -- filtered here at the app layer rather than in RLS, which
  // stays focused on "is this row visible at all" (org/cohort scoping).
  const posts = (allPosts ?? []).filter((p) => !blockedIds.has(p.author_profile_id));

  const postIds = posts.map((p) => p.id);

  const { data: allComments } = postIds.length
    ? await supabase
        .from("comments")
        .select("id, post_id, body, created_at, author_profile_id, profiles(display_name)")
        .in("post_id", postIds)
        .is("deleted_at", null)
        .order("created_at")
    : { data: [] };
  const comments = (allComments ?? []).filter((c) => !blockedIds.has(c.author_profile_id));

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
      <div className="flex items-center justify-between">
        <PageHeading>{org?.name}</PageHeading>
        <Link href={`/o/${slug}/search`} className="text-sm text-primary underline">
          Search
        </Link>
      </div>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {notice ? <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-dark">{notice}</p> : null}

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
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-3">
              <Select name="cohort_id" defaultValue="" className="max-w-56">
                <option value="">Org-wide</option>
                {postableCohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {isStaff && orgStages.length > 0 && (
                <Select name="required_stage_id" defaultValue="" className="max-w-56">
                  <option value="">No stage gate</option>
                  {orgStages.map((s) => (
                    <option key={s.id} value={s.id}>
                      Requires: {s.name}
                    </option>
                  ))}
                </Select>
              )}
              {attachableVideos.length > 0 && (
                <Select name="video_asset_id" defaultValue="" className="max-w-56">
                  <option value="">No video</option>
                  {attachableVideos.map((v) => (
                    <option key={v.id} value={v.id}>
                      Video ({v.duration_seconds ? `${Math.round(v.duration_seconds)}s` : "?"})
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Link href={`/o/${slug}/videos/upload`} className="text-sm text-primary underline">
                Upload a video
              </Link>
              <Button type="submit">Post</Button>
            </div>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        {posts.length === 0 ? (
          <p className="text-ink-soft">Nothing here yet.</p>
        ) : (
          posts.map((post) => (
            <Card key={post.id}>
              <div className="flex items-center justify-between text-sm text-ink-soft">
                <span>
                  {post.profiles?.display_name}
                  {post.cohorts ? ` · ${post.cohorts.name}` : ""}
                  {post.stages ? ` · 🔒 ${post.stages.name}` : ""}
                </span>
                <span>{new Date(post.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{post.body}</p>
              {post.video_asset_id && (
                <Link href={`/o/${slug}/videos/${post.video_asset_id}`} className="mt-2 inline-block text-sm text-primary underline">
                  Watch video
                </Link>
              )}

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
                <Link
                  href={`/o/${slug}/report?type=post&id=${post.id}`}
                  className="text-xs text-ink-soft underline"
                >
                  Report
                </Link>
                {post.author_profile_id !== user.id && (
                  <form action={blockUser}>
                    <input type="hidden" name="blocked_profile_id" value={post.author_profile_id} />
                    <input type="hidden" name="org_slug" value={slug} />
                    <button type="submit" className="text-xs text-ink-soft underline">
                      Block {post.profiles?.display_name}
                    </button>
                  </form>
                )}
              </div>

              <div className="mt-4 space-y-2 border-t border-line pt-3">
                {(commentsByPost.get(post.id) ?? []).map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                    <p>
                      <span className="font-medium">{c.profiles?.display_name}</span>: {c.body}
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <Link href={`/o/${slug}/report?type=comment&id=${c.id}`} className="text-xs text-ink-soft underline">
                        report
                      </Link>
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
