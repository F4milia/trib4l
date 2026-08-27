import { copy } from "./copy";
import type { Database } from "./supabase/database.types";

type Role = Database["public"]["Enums"]["membership_role"];

export type OrgNavItem = { href: string; label: string; description: string };
export type OrgNavSection = { id: "community" | "manage"; heading: string | null; items: OrgNavItem[] };

const items = copy.orgNav.items;

/** Path suffix -> deck key. "" is the org home. */
const COMMUNITY: ReadonlyArray<[string, keyof typeof items]> = [
  ["", "home"],
  ["/mentorship", "mentorship"],
  ["/meetups", "meetups"],
  ["/videos", "videos"],
  ["/live", "live"],
  ["/members", "members"],
  ["/shop", "shop"],
];

const MANAGE: ReadonlyArray<[string, keyof typeof items]> = [
  ["/settings/members", "invitations"],
  ["/settings/products", "products"],
  ["/settings/cohorts", "cohorts"],
  ["/settings/stages", "stages"],
  ["/settings/mentorship", "mentorshipSettings"],
  ["/settings/meetups", "meetupsSettings"],
  ["/settings/videos", "videosSettings"],
  ["/settings/live", "liveSettings"],
  ["/settings/reports", "reports"],
  ["/settings/member-reports", "memberReports"],
];

/** org_owner only, matching the pre-migration nav exactly. */
const OWNER: ReadonlyArray<[string, keyof typeof items]> = [["/settings/commerce", "commerce"]];

const build = (slug: string, defs: ReadonlyArray<[string, keyof typeof items]>): OrgNavItem[] =>
  defs.map(([suffix, key]) => ({ href: `/o/${slug}${suffix}`, ...items[key] }));

/**
 * The single source of truth for what a role can see in the org navigation.
 *
 * `role` must come from the server-resolved membership (invariant 5: role
 * resolves server-side from the database, never from a client claim). This
 * function only formats that decision -- it does not verify it, and the pages
 * behind these routes enforce access themselves via RLS. Hiding a link is
 * navigation, not authorization.
 */
export function orgNav(slug: string, role: Role): OrgNavSection[] {
  const sections: OrgNavSection[] = [{ id: "community", heading: null, items: build(slug, COMMUNITY) }];

  const manages = role === "organizer" || role === "org_owner";
  if (manages) {
    const defs = role === "org_owner" ? [...MANAGE, ...OWNER] : MANAGE;
    sections.push({ id: "manage", heading: copy.orgNav.sections.manage, items: build(slug, defs) });
  }

  return sections;
}
