import { copy } from "./copy";
import type { Database } from "./supabase/database.types";

type Role = Database["public"]["Enums"]["membership_role"];

/**
 * Icon names from §10.1's navigation map. Kept as names rather than
 * components so this module stays free of JSX and can be imported by the
 * server layout as well as the client nav; org-nav.tsx resolves them.
 */
export type OrgNavIcon =
  | "House"
  | "HeartHandshake"
  | "CalendarDays"
  | "Video"
  | "Radio"
  | "Users"
  | "MessagesSquare"
  | "ShoppingBag"
  | "Mail"
  | "Package"
  | "UsersRound"
  | "Milestone"
  | "Flag"
  | "ShieldAlert"
  | "CreditCard"
  | "LayoutGrid";

export type OrgNavItem = {
  href: string;
  label: string;
  description: string;
  icon: OrgNavIcon;
  /**
   * The org home matches its path exactly; every other item also matches its
   * descendants. Without this, /o/x/videos/upload, /o/x/videos/[id],
   * /o/x/live/[id], /o/x/members/report and /o/x/report mark nothing active --
   * and the home item would match every page in the org.
   */
  exact?: true;
};
export type OrgNavSection = { id: "community" | "manage"; heading: string | null; items: OrgNavItem[] };

const items = copy.orgNav.items;

type Def = [suffix: string, key: keyof typeof items, icon: OrgNavIcon];

/** Path suffix -> deck key -> §10.1 icon. "" is the org home. */
const COMMUNITY: ReadonlyArray<Def> = [
  ["", "home", "House"],
  ["/feed", "feed", "LayoutGrid"],
  ["/members", "members", "Users"],
  ["/messages", "messages", "MessagesSquare"],
];

/**
 * §10.1: a Manage item reuses the icon of the subject it configures. The
 * section heading already says these are settings; a second gear-flavoured
 * icon would say it twice and lose the subject.
 */
const MANAGE: ReadonlyArray<Def> = [
  ["/settings/members", "invitations", "Mail"],
  ["/settings/reports", "reports", "Flag"],
  ["/settings/member-reports", "memberReports", "ShieldAlert"],
];

/**
 * Empty, and kept as a list rather than deleted.
 *
 * Its only entry was `/settings/commerce`, and CLAUDE.md is explicit that
 * commerce is dormant-per-Tower with nothing touching Stripe until it is
 * unparked -- so an owner-only link into it advertises a feature the product
 * has deliberately switched off. The route still exists and still refuses a
 * non-owner; only the signpost is gone.
 *
 * The shape stays because org_owner-only navigation is a real tier this
 * product will want again (ownership transfer, the equity surfaces), and
 * re-deriving it from the role logic later is more work than leaving an empty
 * array with a reason attached.
 */
const OWNER: ReadonlyArray<Def> = [];

const build = (slug: string, defs: ReadonlyArray<Def>): OrgNavItem[] =>
  defs.map(([suffix, key, icon]) => ({
    href: `/o/${slug}${suffix}`,
    icon,
    ...items[key],
    ...(suffix === "" ? { exact: true as const } : {}),
  }));

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
