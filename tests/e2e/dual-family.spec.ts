import { expect, test } from "@playwright/test";
import { MANAGING_ROLES, ORG, roleIn, signIn } from "./helpers";

/**
 * The canonical fixture, end to end. CLAUDE.md: "The dual-Family user is the
 * canonical fixture: a member of Families A and B sees exactly their own scope
 * in each, on every surface."
 *
 * The whole navigation shell shipped with server-resolved role gating and this
 * case had never been run against it -- the gap that the methodology audit
 * called the session's highest-value untested path.
 *
 * alice is `member` in caregiver-circle and `mentor` in founder-collective.
 * Two properties in one fixture: no href built for one Family reaches the
 * other, and `mentor` is not a managing role.
 */

const sidebarHrefs = (page: import("@playwright/test").Page) =>
  page.locator("aside a").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));

test.describe("dual-Family user", () => {
  test("sees only Family A's destinations while inside Family A", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto(`/o/${ORG.caregiverCircle}`);

    const hrefs = await sidebarHrefs(page);
    expect(hrefs.length).toBeGreaterThan(5);

    const orgScoped = hrefs.filter((h) => h.startsWith("/o/"));
    for (const h of orgScoped) {
      expect(h, `${h} escaped Family A`).toContain(ORG.caregiverCircle);
      expect(h, `${h} leaked Family B`).not.toContain(ORG.founderCollective);
    }
  });

  test("sees only Family B's destinations while inside Family B", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto(`/o/${ORG.founderCollective}`);

    const orgScoped = (await sidebarHrefs(page)).filter((h) => h.startsWith("/o/"));
    expect(orgScoped.length).toBeGreaterThan(5);
    for (const h of orgScoped) {
      expect(h, `${h} escaped Family B`).toContain(ORG.founderCollective);
      expect(h, `${h} leaked Family A`).not.toContain(ORG.caregiverCircle);
    }
  });

  /**
   * Both Families, role-aware. Greptile flagged an earlier revision of this
   * test for narrowing to founder-collective only: a Manage-leak regression in
   * caregiver-circle would then have passed unnoticed. That was weakening a
   * test to make it stable, which CLAUDE.md rule 6 forbids.
   *
   * The stable formulation asserts the invariant rather than the seed state:
   * the Manage section appears in a Family **iff** the caller's role there is
   * managing. That holds whether or not tests/isolation/invitations.test.ts has
   * promoted alice in caregiver-circle, and it covers both Families -- strictly
   * more than the original, which only ever checked the member case.
   */
  test("shows Manage in a Family only when her role there is managing", async ({ page }) => {
    await signIn(page, "alice");

    for (const slug of [ORG.caregiverCircle, ORG.founderCollective]) {
      const role = await roleIn("alice", slug);
      expect(role, `alice has no membership in ${slug}`).not.toBeNull();
      const manages = (MANAGING_ROLES as readonly string[]).includes(role!);

      await page.goto(`/o/${slug}`);
      const nav = page.getByRole("navigation", { name: "Main navigation" }).first();
      const settings = (await sidebarHrefs(page)).filter((h) => h.includes("/settings/"));

      if (manages) {
        await expect(nav.getByText("Manage"), `Manage missing in ${slug} for ${role}`).toBeVisible();
        expect(settings.length, `no settings links in ${slug} for ${role}`).toBeGreaterThan(0);
        // Even when managing, nothing may point at the other Family.
        for (const h of settings) expect(h).toContain(slug);
      } else {
        await expect(nav.getByText("Manage"), `Manage leaked in ${slug} for ${role}`).toHaveCount(0);
        expect(settings, `settings link leaked in ${slug} for ${role}`).toEqual([]);
      }
    }
  });

  test("is offered exactly her own two Families in the switcher, and no third", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto(`/o/${ORG.caregiverCircle}`);

    const values = await page
      .locator("aside select option")
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));

    // Length, then uniqueness, then contents. Comparing Sets alone would have
    // passed a switcher that listed the same Family twice.
    expect(values).toHaveLength(2);
    expect(new Set(values).size).toBe(2);
    expect(values.slice().sort()).toEqual([ORG.caregiverCircle, ORG.founderCollective].sort());
    expect(values, "a Family she does not belong to appeared").not.toContain(ORG.wellnessGuild);
  });

  /**
   * Hiding a nav link is navigation, not authorization. She is `mentor` in
   * Family B, not org_owner, so the page itself must refuse -- independent of
   * whether a link to it was rendered.
   */
  test("cannot reach a Family B owner-only surface by URL", async ({ page }) => {
    await signIn(page, "alice");
    const res = await page.goto(`/o/${ORG.founderCollective}/settings/commerce`);

    // Pin the destination, not merely "somewhere else". settings/commerce is
    // org_owner scope, not organizer, and redirects to the Family home -- so a
    // bounce to `/`, to another Family, or to an error page would all be wrong
    // and all used to satisfy this test.
    // `(/feed)?` is TEMPORARY and belongs to this PR only. The Family home
    // currently redirects to /feed while D1's dashboard is not there yet, so
    // the refusal lands one hop further on than it used to. The intent above is
    // unchanged and still enforced: she ends up inside FAMILY B, at its home,
    // with a 200 -- not at `/`, not in another Family, not on an error page.
    // The next PR puts the dashboard on the org root and restores the strict
    // `$` form, so this alternation must not outlive that.
    await expect(page).toHaveURL(new RegExp(`/o/${ORG.founderCollective}(/feed)?$`));
    expect(res?.status()).toBe(200);
    // And she is still genuinely inside Family B, not bounced out of it.
    await expect(page.getByRole("navigation", { name: "Main navigation" }).first()).toBeVisible();
  });

  /**
   * Invariant 1: a Family she is not in must be indistinguishable from one that
   * does not exist. notFound() renders a 404 in place, so the URL is unchanged
   * -- the status and the absence of the org shell are what carry the meaning,
   * not a redirect.
   *
   * This pair is the actual invariant test: both cases must answer identically.
   */
  test("gets a 404, not a crash, for a Family she belongs to neither of", async ({ page }) => {
    await signIn(page, "alice");
    const res = await page.goto(`/o/${ORG.wellnessGuild}`);
    expect(res?.status()).toBe(404);
    // The org shell must not render at all -- no nav, no switcher.
    await expect(page.locator("aside")).toHaveCount(0);
  });

  /**
   * Nested surfaces, same contract. Verified by experiment that the layout's
   * own notFound() already provides this for every route under /o/[slug] --
   * reverting the page-level guards leaves these green. So this pins existing
   * correct behaviour rather than proving a fix, which is the useful thing to
   * lock in before PR 2/5 starts adding triggers underneath it.
   */
  for (const path of ["search", "report?type=post&id=00000000-0000-0000-0000-000000000000"]) {
    test(`returns 404 on /${path.split("?")[0]} for a Family she is not in`, async ({ page }) => {
      await signIn(page, "alice");
      const res = await page.goto(`/o/${ORG.wellnessGuild}/${path}`);
      expect(res?.status()).toBe(404);
      await expect(page.locator("aside")).toHaveCount(0);
    });
  }

  test("answers identically for a Family that does not exist -- indistinguishable", async ({ page }) => {
    await signIn(page, "alice");
    const nonMember = await page.goto(`/o/${ORG.wellnessGuild}`);
    const nonExistent = await page.goto("/o/no-such-family-at-all");
    expect(nonExistent?.status()).toBe(nonMember?.status());
    await expect(page.locator("aside")).toHaveCount(0);
  });
});
