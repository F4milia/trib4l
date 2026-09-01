import { describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import { ORG_IDS, QA_FIXTURES, QA_TOTP_SECRET, signInAs } from "./helpers";

/**
 * The named QA fixtures are USABLE, not just present.
 *
 * 190_qa_fixtures.sql asserts each account is in the state its name claims --
 * but it runs as `postgres` and cannot sign anybody in. These are the claims a
 * QA doc actually depends on: that a human can log in as one of these accounts
 * and immediately be in the situation the fixture is named for.
 *
 * The staff 2FA test is the one that matters most. Invariant 7 enforces
 * two-factor for platform_staff at sign-in, so a seeded factor that does not
 * actually authenticate would make every staff QA step unrunnable -- and the
 * failure would show up as "invalid code" during a QA session, which is the
 * worst time to discover it.
 *
 * One sign-in per account, memoised: the suite already runs ~180 of them
 * against S2's five-per-fifteen-minutes limiter.
 */
const clients = new Map<string, Promise<Awaited<ReturnType<typeof signInAs>>>>();
function as(user: { email: string; password: string }) {
  const existing = clients.get(user.email);
  if (existing) return existing;
  const created = signInAs(user);
  clients.set(user.email, created);
  return created;
}

describe("QA fixtures are usable, not just present", () => {
  it("staff1@ reaches aal2 with the SEEDED TOTP secret -- no manual enrolment", async () => {
    const staff = await as(QA_FIXTURES.staff1);

    // The factor is already there, verified, from the seed. A QA session must
    // not have to enrol one after every reset -- that is the friction
    // prerequisite 2 exists to remove.
    const { data: factors } = await staff.auth.mfa.listFactors();
    const totp = (factors?.totp ?? [])[0];
    expect(totp?.status).toBe("verified");

    const code = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(QA_TOTP_SECRET),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    }).generate();

    const { data: challenge, error: challengeError } = await staff.auth.mfa.challenge({
      factorId: totp!.id,
    });
    expect(challengeError).toBeNull();

    const { error: verifyError } = await staff.auth.mfa.verify({
      factorId: totp!.id,
      challengeId: challenge!.id,
      code,
    });
    expect(verifyError).toBeNull();

    const { data: aal } = await staff.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal?.currentLevel).toBe("aal2");

    // And the elevated staff session can actually see across Families, which
    // is what a staff QA step is for.
    const { data: orgs } = await staff.from("organizations").select("id");
    expect((orgs ?? []).length).toBeGreaterThan(1);
  });

  it("orphan@ has signed up and belongs to nothing", async () => {
    const orphan = await as(QA_FIXTURES.orphan);

    const { data: orgs } = await orphan.from("organizations").select("id");
    expect(orgs ?? []).toEqual([]);

    const { data: memberships } = await orphan.from("memberships").select("id");
    expect(memberships ?? []).toEqual([]);
  });

  it("dual@ sees a different Tower in each of their two Families", async () => {
    const dual = await as(QA_FIXTURES.dual);

    const { data: a } = await dual.from("towers").select("title").eq("org_id", ORG_IDS.qaFamilyA).maybeSingle();
    const { data: b } = await dual.from("towers").select("title").eq("org_id", ORG_IDS.qaFamilyB).maybeSingle();

    expect(a?.title).toBeTruthy();
    expect(b?.title).toBeTruthy();
    expect(a!.title).not.toBe(b!.title);
  });

  it("blocker@ cannot see blocked@'s entries; another member in the room can", async () => {
    const blocker = await as(QA_FIXTURES.blocker);
    const second = await as(QA_FIXTURES.second);

    const blockedsEntries = async (client: Awaited<ReturnType<typeof signInAs>>) => {
      const { data } = await client
        .from("table_entries")
        .select("id, response_text")
        .eq("org_id", ORG_IDS.qaFamilyA);
      return (data ?? []).filter((e) => e.response_text.includes("blocked account has something to hide"));
    };

    // The positive half first: the content exists and the room can see it.
    // Without this, the assertion below passes even if the entries were never
    // seeded at all.
    expect((await blockedsEntries(second)).length).toBeGreaterThan(0);
    expect(await blockedsEntries(blocker)).toEqual([]);
  });

  it("departed@'s Bricks are open and attributed to nobody", async () => {
    const second = await as(QA_FIXTURES.second);

    const { data: bricks } = await second
      .from("bricks")
      .select("status, assignee")
      .eq("org_id", ORG_IDS.qaFamilyA);

    const orphaned = (bricks ?? []).filter((b) => b.assignee === null);
    expect(orphaned.length).toBeGreaterThan(0);
    // Nobody-holds-it and not-open together is the ghost D2's edge case names.
    expect(orphaned.every((b) => b.status === "open")).toBe(true);
  });
});
