import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { ORG, ORG_IDS, USER_IDS, signIn } from "./helpers";

/**
 * C1's named edge case, in a real browser.
 *
 * The run doc assigns this as the check a human executes by hand before
 * merging: "a user who is a member of BOTH Families A and B sees exactly their
 * own conversations in each and nothing across."
 *
 * supabase/tests/database/111_conversations_rls.sql proves the policies, and
 * tests/isolation/conversations.test.ts proves lib/conversations.ts inherits
 * them. Neither proves the SCREEN does -- a page that fetched with the service
 * role, or that took a conversation id from the URL without checking which
 * Family it belongs to, would pass both and still leak here.
 *
 * THE FIXTURE IS THE POINT. Caregiver Circle holds only Alice and Bob in the
 * seed, so every room in it is one Alice belongs to -- and this spec would pass
 * against a policy that simply returned everything in her Families, which is
 * the exact bug it exists to catch. Dave gets a second membership and a DM with
 * Bob, and Alice must not see that room.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CAREGIVER = ORG_IDS[ORG.caregiverCircle];
const FOUNDER = ORG_IDS[ORG.founderCollective];

const PRIVATE_BODY = "BOB-TO-DAVE-PRIVATE";
const CAREGIVER_BODY = "CAREGIVER-CIRCLE-CHANNEL";
const FOUNDER_BODY = "FOUNDER-COLLECTIVE-CHANNEL";

/** The DM Alice must never see, and the rooms she must. */
let privateDmId = "";
let caregiverChannelId = "";
let founderChannelId = "";

/**
 * Service role ONLY to build the fixture -- never to assert. Every assertion
 * below runs in the browser as Alice, through the app, against her own policy.
 * Seeding state a Family could genuinely reach is what this is for; reading
 * around RLS is what it must not be used for.
 */
test.beforeAll(async () => {
  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  const channel = async (orgId: string) => {
    const { data } = await service
      .from("conversations")
      .select("id")
      .eq("org_id", orgId)
      .eq("kind", "family_channel")
      .is("deleted_at", null)
      .single();
    return data!.id as string;
  };

  caregiverChannelId = await channel(CAREGIVER);
  founderChannelId = await channel(FOUNDER);

  const membership = async (orgId: string, profileId: string) => {
    const { data } = await service
      .from("memberships")
      .select("id")
      .eq("org_id", orgId)
      .eq("profile_id", profileId)
      .is("deleted_at", null)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  };

  // Dave joins Caregiver Circle. PR 3's trigger adds him to the channel.
  if (!(await membership(CAREGIVER, USER_IDS.dave))) {
    await service
      .from("memberships")
      .insert({ org_id: CAREGIVER, profile_id: USER_IDS.dave, role: "member" });
  }

  const bobMembership = (await membership(CAREGIVER, USER_IDS.bob))!;
  const daveMembership = (await membership(CAREGIVER, USER_IDS.dave))!;

  // FIND OR CREATE, not create. This spec runs against a database it does not
  // reset, so a second run must not add a second DM and a second copy of every
  // message -- the first version did, and Playwright's strict mode then failed
  // on "resolved to 14 elements", which reads like a product bug and is not.
  const { data: existingDm } = await service
    .from("conversations")
    .select("id")
    .eq("org_id", CAREGIVER)
    .eq("kind", "direct")
    .eq("created_by_membership_id", bobMembership)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (existingDm) {
    privateDmId = existingDm.id as string;
  } else {
    const { data: dm } = await service
      .from("conversations")
      .insert({ org_id: CAREGIVER, kind: "direct", created_by_membership_id: bobMembership })
      .select("id")
      .single();
    privateDmId = dm!.id as string;

    await service.from("conversation_participants").insert([
      { org_id: CAREGIVER, conversation_id: privateDmId, membership_id: bobMembership },
      { org_id: CAREGIVER, conversation_id: privateDmId, membership_id: daveMembership },
    ]);
  }

  const carolMembership = (await membership(FOUNDER, USER_IDS.carol))!;

  // One of each body, however many times this file runs.
  const ensureMessage = async (
    conversationId: string,
    orgId: string,
    authorMembershipId: string,
    body: string,
  ) => {
    const { count } = await service
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("body", body);
    if ((count ?? 0) === 0) {
      await service
        .from("messages")
        .insert({ org_id: orgId, conversation_id: conversationId, author_membership_id: authorMembershipId, body });
    }
  };

  await ensureMessage(privateDmId, CAREGIVER, bobMembership, PRIVATE_BODY);
  await ensureMessage(caregiverChannelId, CAREGIVER, bobMembership, CAREGIVER_BODY);
  await ensureMessage(founderChannelId, FOUNDER, carolMembership, FOUNDER_BODY);
});

test.describe("dual-Family user, conversations", () => {
  test("sees Family A's rooms in A and Family B's in B, with no overlap", async ({ page }) => {
    await signIn(page, "alice");

    await page.goto(`/o/${ORG.caregiverCircle}/messages`);
    const inA = await page
      .locator('a[href*="/messages/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));

    await page.goto(`/o/${ORG.founderCollective}/messages`);
    const inB = await page
      .locator('a[href*="/messages/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));

    expect(inA.length, "Family A listed no rooms at all").toBeGreaterThan(0);
    expect(inB.length, "Family B listed no rooms at all").toBeGreaterThan(0);

    // Each list stays inside the Family whose page it is.
    for (const href of inA) expect(href).toContain(ORG.caregiverCircle);
    for (const href of inB) expect(href).toContain(ORG.founderCollective);

    // And the two sets of ROOMS are disjoint -- the claim the slug check above
    // cannot make, because a leak would carry the current Family's slug while
    // pointing at the other Family's conversation.
    const ids = (hrefs: string[]) => new Set(hrefs.map((h) => h.split("/messages/")[1]));
    const overlap = [...ids(inA)].filter((id) => ids(inB).has(id));
    expect(overlap, "a room appeared in both Families").toHaveLength(0);
  });

  test("does not list a DM between two other members of her own Family", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto(`/o/${ORG.caregiverCircle}/messages`);

    const hrefs = await page
      .locator('a[href*="/messages/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));

    // Being in the Family is not being in the room. This is the assertion the
    // seed alone cannot make.
    expect(hrefs.some((h) => h.includes(privateDmId)), "Bob and Dave's DM was listed").toBe(false);
    await expect(page.getByText(PRIVATE_BODY)).toHaveCount(0);
  });

  test("cannot open that DM by typing its URL", async ({ page }) => {
    await signIn(page, "alice");

    // Hiding a link is navigation, not authorization. The refusal has to hold
    // when the id is known and asked for directly.
    const response = await page.goto(
      `/o/${ORG.caregiverCircle}/messages/${privateDmId}`,
      { waitUntil: "domcontentloaded" },
    );

    expect(response?.status(), "the DM rendered instead of 404ing").toBe(404);
    await expect(page.getByText(PRIVATE_BODY)).toHaveCount(0);
  });

  test("sees each Family's own messages, and never the other's", async ({ page }) => {
    await signIn(page, "alice");

    await page.goto(`/o/${ORG.caregiverCircle}/messages/${caregiverChannelId}`);
    await expect(page.getByText(CAREGIVER_BODY)).toBeVisible();
    await expect(page.getByText(FOUNDER_BODY)).toHaveCount(0);
    await expect(page.getByText(PRIVATE_BODY)).toHaveCount(0);

    await page.goto(`/o/${ORG.founderCollective}/messages/${founderChannelId}`);
    await expect(page.getByText(FOUNDER_BODY)).toBeVisible();
    await expect(page.getByText(CAREGIVER_BODY)).toHaveCount(0);
  });

  test("cannot reach Family B's channel through Family A's URL", async ({ page }) => {
    await signIn(page, "alice");

    // Alice can see BOTH of these rooms -- just not from here. A page that
    // trusted the id in the URL without checking which Family it belongs to
    // would render Founder Collective's channel under Caregiver Circle's slug,
    // and every other assertion in this file would still pass.
    const response = await page.goto(
      `/o/${ORG.caregiverCircle}/messages/${founderChannelId}`,
      { waitUntil: "domcontentloaded" },
    );

    expect(response?.status(), "Family B's channel opened inside Family A").toBe(404);
    await expect(page.getByText(FOUNDER_BODY)).toHaveCount(0);
  });
});
