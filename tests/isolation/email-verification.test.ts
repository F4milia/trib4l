import { beforeAll, describe, expect, it } from "vitest";
import { ORG_IDS, TEST_CAPTCHA, createAnonClient, createServiceRoleClient } from "./helpers";

/**
 * S1's hardest acceptance criterion: "Unverified accounts cannot reach any
 * Family data -- proven by test, not assumption."
 *
 * The gate is not RLS. It is upstream of RLS: an unverified person never holds
 * a JWT to present to a policy at all. That is what these tests assert against
 * a real GoTrue.
 *
 * It is worth being exact about which half of that each setting buys, because
 * flipping `enable_confirmations` off and re-running this file fails ONE test,
 * not four -- measured, on 2026-08-30, not assumed:
 *
 *   - GoTrue refuses a password sign-in for any user whose `email_confirmed_at`
 *     is null, and does so REGARDLESS of `enable_confirmations`. That is a
 *     property of GoTrue, and the "cannot sign in" and "reads nothing"
 *     assertions below rest on it.
 *   - `[auth.email] enable_confirmations = true` is what puts a public
 *     sign-up into that unconfirmed state in the first place. With it off,
 *     signUp auto-confirms and returns a live session, and nobody is ever
 *     unverified. That is the assertion that moves when the setting moves, and
 *     it is the one CLAUDE.md's "must demonstrably fail with its policy
 *     removed" rule is satisfied by here.
 *
 * Deliberately NOT tested, because it would be false: an `email_verified`
 * claim inside the JWT. GoTrue carries that flag in `user_metadata`, which the
 * user can rewrite themselves via `auth.updateUser({ data })`. An RLS policy
 * reading it would be checking an attacker-supplied value. The session's
 * existence is the trustworthy signal; the claim is not.
 *
 * The fixture is deliberately the hardest case: a person who is already a real
 * member of a Family, with a real memberships row, whose ONLY missing step is
 * confirming their address. A test on a membership-less stranger would pass
 * for the wrong reason -- it would be proving RLS, which the rest of this
 * suite already covers.
 */

const PASSWORD = "password123";
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const unconfirmed = { email: `unconfirmed-${stamp}@f4milia.test`, password: PASSWORD };
const confirmed = { email: `confirmed-${stamp}@f4milia.test`, password: PASSWORD };

beforeAll(async () => {
  const service = createServiceRoleClient();

  for (const [person, emailConfirm] of [
    [unconfirmed, false],
    [confirmed, true],
  ] as const) {
    const { data, error } = await service.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: emailConfirm,
    });
    if (error || !data.user) throw new Error(`could not seed ${person.email}: ${error?.message}`);

    // Both are genuine members of Caregiver Circle. The only difference
    // between them is the confirmed address.
    const { error: membershipError } = await service
      .from("memberships")
      .insert({ org_id: ORG_IDS.caregiverCircle, profile_id: data.user.id, role: "member" });
    if (membershipError) throw new Error(`could not seed membership: ${membershipError.message}`);
  }
});

describe("signing up issues no credential", () => {
  /** The assertion that fails when `enable_confirmations` is turned off. */
  it("returns a user but no session, so there is nothing to authenticate with", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.auth.signUp({
      email: `fresh-${stamp}@f4milia.test`,
      password: PASSWORD,
      options: TEST_CAPTCHA,
    });

    expect(error).toBeNull();
    expect(data.user).not.toBeNull();
    expect(data.session).toBeNull();
  });
});

describe("an unconfirmed member of a real Family", () => {
  it("cannot sign in at all", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.auth.signInWithPassword({ ...unconfirmed, options: TEST_CAPTCHA });

    expect(data.session).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe("email_not_confirmed");
  });

  it("reads nothing of the Family they belong to, holding the strongest credential they can get", async () => {
    const anon = createAnonClient();
    // The refused sign-in leaves the client on the anon key -- which is
    // exactly the credential a real unverified person is left holding.
    await anon.auth.signInWithPassword({ ...unconfirmed, options: TEST_CAPTCHA });
    expect((await anon.auth.getSession()).data.session).toBeNull();

    const { data: orgs } = await anon
      .from("organizations")
      .select("id")
      .eq("id", ORG_IDS.caregiverCircle);
    expect(orgs ?? []).toHaveLength(0);

    const { data: members } = await anon
      .from("memberships")
      .select("id")
      .eq("org_id", ORG_IDS.caregiverCircle);
    expect(members ?? []).toHaveLength(0);

    const { data: posts } = await anon.from("posts").select("id").eq("org_id", ORG_IDS.caregiverCircle);
    expect(posts ?? []).toHaveLength(0);
  });
});

/**
 * The control, and the reason the assertions above mean anything. CLAUDE.md's
 * testing rule -- "every isolation test must demonstrably fail with its policy
 * removed" -- applied to a gate that is a setting rather than a policy: the
 * same fixture, the same Family, the same membership, differing only in the
 * confirmed address, must succeed. Without this, a broken fixture would return
 * zero rows and read as a pass.
 */
describe("the same member with a confirmed address", () => {
  it("signs in and reads exactly the Family they belong to", async () => {
    const anon = createAnonClient();
    const { data: session, error } = await anon.auth.signInWithPassword({ ...confirmed, options: TEST_CAPTCHA });

    expect(error).toBeNull();
    expect(session.session).not.toBeNull();

    const { data: orgs } = await anon
      .from("organizations")
      .select("id")
      .eq("id", ORG_IDS.caregiverCircle);
    expect(orgs).toHaveLength(1);

    // ...and still nothing of a Family they do not belong to, so the
    // confirmation gate has not been mistaken for a general bypass.
    const { data: other } = await anon
      .from("organizations")
      .select("id")
      .eq("id", ORG_IDS.wellnessGuild);
    expect(other ?? []).toHaveLength(0);
  });
});
