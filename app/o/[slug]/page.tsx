import { redirect } from "next/navigation";

/**
 * TEMPORARY, and it exists so the trunk is never broken between two PRs.
 *
 * `/o/[slug]` is where D1's dashboard goes -- "the screen a member lands on
 * daily". This PR only MOVES the inherited Trib4l posts feed out of the way,
 * to `/o/[slug]/feed`; the dashboard arrives in the next one and replaces this
 * file. Leaving the route 404 in between would break the org nav's home item
 * and every link that predates the move, so it redirects instead.
 *
 * `replace`, not `push`: this is a route that is going away, and it should not
 * sit in anybody's back history once the dashboard lands.
 */
export default async function OrgHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/o/${slug}/feed`);
}
