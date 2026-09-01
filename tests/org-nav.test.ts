import { describe, expect, it } from "vitest";
import { copy } from "@/lib/copy";
import { orgNav } from "@/lib/org-nav";

const SLUG = "caregiver-circle";
const hrefs = (role: Parameters<typeof orgNav>[1]) =>
  orgNav(SLUG, role).flatMap((s) => s.items.map((i) => i.href));

/**
 * The href sets the pre-migration nav rendered, transcribed from
 * app/o/[slug]/layout.tsx before C1b replaces it. This is the regression
 * guard: the sidebar must expose exactly what the old bar exposed, per role,
 * no more and no less. Role resolves server-side (invariant 5) and orgNav is
 * the only thing deciding visibility, so this is where that decision is
 * pinned down.
 */
const COMMUNITY = [
  // /messages is C1: the Family channel and DMs. Added to this census rather
  // than exempted from it -- the census is the point of the file, and a nav
  // item nobody pinned is a nav item that can silently appear for the wrong
  // role.
  // Trimmed to F4milia's own concepts. Mentorship, Meetups, Videos, Live and
  // Shop are Trib4l inheritance and no session in the run doc builds on them,
  // so the nav no longer offers them. Their ROUTES still exist and still
  // enforce their own access — only the signposts are gone, which is why this
  // census shrank rather than the app losing surfaces.
  "", "/feed", "/members", "/messages",
].map((p) => `/o/${SLUG}${p}`);

const MANAGE = [
  // Invitations stays: W2's first-run needs it. Reports and member-reports stay
  // because they are invariant 6's surface. The rest configure features the nav
  // no longer offers.
  "/settings/members", "/settings/reports", "/settings/member-reports",
].map((p) => `/o/${SLUG}${p}`);

const COMMERCE = `/o/${SLUG}/settings/commerce`;

describe("orgNav role gating", () => {
  it.each(["member", "mentor"] as const)("gives %s the community section only", (role) => {
    expect(hrefs(role)).toEqual(COMMUNITY);
    expect(orgNav(SLUG, role)).toHaveLength(1);
  });

  it("gives organizer the manage section, but not commerce", () => {
    expect(hrefs("organizer")).toEqual([...COMMUNITY, ...MANAGE]);
    expect(hrefs("organizer")).not.toContain(COMMERCE);
  });

  /**
   * org_owner now sees exactly what an organizer sees. The owner-only tier held
   * one link, /settings/commerce, and CLAUDE.md is explicit that commerce is
   * dormant-per-Tower with nothing touching Stripe until it is unparked — so
   * the nav no longer advertises it.
   *
   * Asserted rather than deleted, because the claim has changed rather than
   * disappeared: an owner must see no MORE than an organizer, and an owner-only
   * item reappearing silently is exactly what this file exists to catch.
   */
  it("gives org_owner the same nav as an organizer -- commerce is not advertised", () => {
    expect(hrefs("org_owner")).toEqual([...COMMUNITY, ...MANAGE]);
    expect(hrefs("org_owner")).not.toContain(COMMERCE);
  });

  it("never leaks a settings route to a non-managing role", () => {
    for (const role of ["member", "mentor"] as const) {
      expect(hrefs(role).some((h) => h.includes("/settings/"))).toBe(false);
    }
  });
});

describe("orgNav shape", () => {
  it("scopes every href to the slug it was given", () => {
    for (const href of hrefs("org_owner")) {
      expect(href.startsWith(`/o/${SLUG}`)).toBe(true);
    }
  });

  it("has no duplicate destinations", () => {
    const all = hrefs("org_owner");
    expect(new Set(all).size).toBe(all.length);
  });

  it("heads the manage section and leaves the primary section unheaded", () => {
    const [community, manage] = orgNav(SLUG, "org_owner");
    expect(community.heading).toBeNull();
    expect(manage.heading).toBe(copy.orgNav.sections.manage);
  });
});

/**
 * CLAUDE.md: "New UI strings go in the copy deck, never inline." Asserting
 * reference equality against the deck is what makes that mechanical -- an
 * inline string would still render, so nothing else would catch it.
 */
describe("copy deck", () => {
  const deck = Object.values(copy.orgNav.items);

  it("sources every nav label and description from the deck", () => {
    for (const item of orgNav(SLUG, "org_owner").flatMap((s) => s.items)) {
      expect(deck.some((d) => d.label === item.label && d.description === item.description)).toBe(true);
    }
  });

  it("has no empty or placeholder strings -- honest copy, nothing invented", () => {
    for (const { label, description } of deck) {
      expect(label.trim().length).toBeGreaterThan(0);
      expect(description.trim().length).toBeGreaterThan(0);
      expect(`${label} ${description}`).not.toMatch(/TODO|TBD|Lorem|placeholder/i);
    }
  });
});

/**
 * The dual-Family fixture. CLAUDE.md names it the canonical test: "a member of
 * Families A and B sees exactly their own scope in each, on every surface."
 *
 * alice is `member` in caregiver-circle and `mentor` in founder-collective, so
 * this covers two things at once -- that nav built for one Family never carries
 * an href into another, and that `mentor` is not a managing role even though it
 * is a privileged-sounding one.
 */
describe("dual-Family scoping", () => {
  const A = "caregiver-circle";
  const B = "founder-collective";

  it("never leaks an href from one Family into the other's nav", () => {
    for (const [slug, other, role] of [
      [A, B, "member"],
      [B, A, "mentor"],
    ] as const) {
      const items = orgNav(slug, role).flatMap((s) => s.items);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.href.startsWith(`/o/${slug}`), `${item.href} escaped /o/${slug}`).toBe(true);
        expect(item.href).not.toContain(other);
      }
    }
  });

  it("treats mentor as non-managing, despite the privileged-sounding name", () => {
    const sections = orgNav(B, "mentor");
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe("community");
    expect(sections.flatMap((s) => s.items).some((i) => i.href.includes("/settings/"))).toBe(false);
  });

  it("gives the same person the same nav shape in each Family, on disjoint routes", () => {
    const hrefs = (slug: string, role: "member" | "mentor") =>
      orgNav(slug, role).flatMap((s) => s.items).map((i) => i.href);
    const asMember = hrefs(A, "member");
    const asMentor = hrefs(B, "mentor");

    // Normalise the slug out and compare the route shapes themselves. Equal
    // lengths alone would have passed two entirely different route sets.
    const shape = (list: string[], slug: string) => list.map((h) => h.replace(`/o/${slug}`, ""));
    expect(shape(asMember, A)).toEqual(shape(asMentor, B));

    // Same shape, and yet not one shared destination -- that is the isolation.
    expect(asMember.filter((h) => asMentor.includes(h))).toEqual([]);
  });
});
