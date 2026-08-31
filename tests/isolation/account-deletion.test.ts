import { describe, expect, it } from "vitest";
import { SEEDED_USERS, createAnonClient, signInAs, signUpNewUser } from "./helpers";

/**
 * delete_my_account() through PostgREST (S2, PR 9).
 *
 * 080_delete_my_account.sql checks all four policy steps against seeded data --
 * that the profile is scrubbed but survives, that memberships are soft-deleted
 * and never removed, that audit_log is untouched. It runs as `postgres`, which is
 * what lets it read those rows at all: measured 2026-09-01, `service_role` holds
 * no SELECT on `profiles` (grants here are least-privilege per migration --
 * CLAUDE.md, 2026-08-29), so a test at THIS layer cannot inspect the
 * anonymisation and should not pretend to. My first version tried, and failed on
 * a null it had read as a product bug.
 *
 * What this layer adds is what a real signed-in caller experiences.
 *
 * Every test uses a DISPOSABLE account: deleting a seeded user would anonymize
 * them for every file that runs afterwards, and there is no undo.
 */
describe("delete_my_account", () => {
  it("succeeds for the caller and ends their session", async () => {
    const client = await signUpNewUser(`deletion-${Date.now()}@f4milia.test`);

    const { data: deleted, error } = await client.rpc("delete_my_account");
    expect(error).toBeNull();
    expect(deleted).toBe(true);

    // GoTrue refuses the token now, so the next question about identity fails.
    const after = await client.auth.getUser();
    expect(after.error).not.toBeNull();
    expect(after.data.user).toBeNull();
  });

  it("cannot be aimed at another account", async () => {
    const client = await signUpNewUser(`deletion-scope-${Date.now()}@f4milia.test`);
    await client.rpc("delete_my_account");

    /**
     * Alice reads her OWN profile with her own session -- `authenticated` has
     * SELECT on profiles, `service_role` does not. She is untouched: the function
     * reads auth.uid() and takes no argument, so there is nothing to aim.
     * Asserted anyway, because "takes no argument" is a fact about today's
     * signature rather than a guarantee about tomorrow's.
     */
    const alice = await signInAs(SEEDED_USERS.alice);
    const aliceId = (await alice.auth.getUser()).data.user!.id;
    const { data: profile, error } = await alice
      .from("profiles")
      .select("display_name, deleted_at")
      .eq("id", aliceId)
      .single();

    expect(error).toBeNull();
    expect(profile!.deleted_at).toBeNull();
    expect(profile!.display_name).not.toBe("Deleted user");
  });

  it("is unreachable without a session", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("delete_my_account");
    expect(error).not.toBeNull();
  });

  /**
   * A second attempt returns FALSE, not an error, and the reason is worth
   * recording because it is surprising: the session is revoked, but PostgREST
   * validates only a JWT signature and expiry -- not whether the session still
   * exists -- so the still-unexpired token reaches the function, which finds
   * deleted_at already set and declines. Measured; my first version of this test
   * expected an error.
   *
   * The consequence that matters: a repeat request does not move deleted_at
   * forward or write a second audit row.
   */
  it("declines a second attempt instead of deleting twice", async () => {
    const client = await signUpNewUser(`deletion-twice-${Date.now()}@f4milia.test`);
    expect((await client.rpc("delete_my_account")).data).toBe(true);

    const { data: second, error } = await client.rpc("delete_my_account");
    expect(error).toBeNull();
    expect(second).toBe(false);
  });
});
