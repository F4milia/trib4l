import { describe, expect, it } from "vitest";
import { SEEDED_USERS, createAnonClient, signInAs } from "./helpers";

// The raw-token test below bypasses the SDK deliberately, so it needs these
// directly. Same local-dev demo values helpers.ts commits, for the same reason.
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/**
 * The session list and revoke, driven through PostgREST as real signed-in users.
 *
 * This is the layer pgTAP cannot reach: 070_own_session_read_and_revoke.sql
 * impersonates a JWT with set_config, which proves the predicate but not that a
 * genuine `authenticated` request over HTTP resolves auth.uid() the same way, or
 * that a revoked session is actually dead afterwards.
 *
 * Two clients signed in as the SAME person is the shape that matters here --
 * that is what "another device" is.
 */
describe("my_sessions", () => {
  it("shows a member both of their own devices, and marks the one asking", async () => {
    const deviceA = await signInAs(SEEDED_USERS.alice);
    const deviceB = await signInAs(SEEDED_USERS.alice);

    const { data: fromA, error } = await deviceA.rpc("my_sessions");
    expect(error).toBeNull();

    const { data: sessionB } = await deviceB.auth.getSession();
    const idB = sessionB.session!.access_token
      ? JSON.parse(
          Buffer.from(sessionB.session!.access_token.split(".")[1], "base64").toString(),
        ).session_id
      : null;

    const rows = fromA as Array<{ id: string; is_current: boolean }>;
    expect(rows.map((r) => r.id)).toContain(idB);
    // Exactly one row is the asking device, and it is not B.
    expect(rows.filter((r) => r.is_current)).toHaveLength(1);
    expect(rows.find((r) => r.is_current)!.id).not.toBe(idB);
  });

  it("never shows another member's session", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const { data: bobSession } = await bob.auth.getSession();
    const bobSessionId = JSON.parse(
      Buffer.from(bobSession.session!.access_token.split(".")[1], "base64").toString(),
    ).session_id;

    const { data } = await alice.rpc("my_sessions");
    expect((data as Array<{ id: string }>).map((r) => r.id)).not.toContain(bobSessionId);
  });

  it("is unreachable without a session", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.rpc("my_sessions");
    // anon holds no EXECUTE, so this is refused rather than returning an empty list.
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe("revoke_my_session", () => {
  /**
   * S2's named edge case, in the form a test can hold: device A revokes device
   * B, and B is dead the next time it asks who it is.
   *
   * getUser() is the right probe, not getSession(): getSession reads the cached
   * token out of local storage and would still "succeed" for an hour. getUser
   * asks GoTrue, which is what proxy.ts and lib/session.ts do on every request.
   */
  it("kills the other device on its next request", async () => {
    const deviceA = await signInAs(SEEDED_USERS.alice);
    const deviceB = await signInAs(SEEDED_USERS.alice);

    const { data: sessionB } = await deviceB.auth.getSession();
    const idB = JSON.parse(
      Buffer.from(sessionB.session!.access_token.split(".")[1], "base64").toString(),
    ).session_id;

    expect((await deviceB.auth.getUser()).error).toBeNull();

    const { data: revoked, error } = await deviceA.rpc("revoke_my_session", {
      p_session_id: idB,
    });
    expect(error).toBeNull();
    expect(revoked).toBe(true);

    const after = await deviceB.auth.getUser();
    expect(after.error).not.toBeNull();
    expect(after.data.user).toBeNull();

    // And A is untouched -- revoking one device must not sign out the one asking.
    expect((await deviceA.auth.getUser()).error).toBeNull();
  });

  it("cannot revoke another member's session", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const { data: bobSession } = await bob.auth.getSession();
    const bobSessionId = JSON.parse(
      Buffer.from(bobSession.session!.access_token.split(".")[1], "base64").toString(),
    ).session_id;

    const { data: revoked } = await alice.rpc("revoke_my_session", {
      p_session_id: bobSessionId,
    });

    expect(revoked).toBe(false);
    // The one that would be a cross-account session kill: Bob is still signed in.
    expect((await bob.auth.getUser()).error).toBeNull();
  });

  it("answers the same for a session that never existed", async () => {
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data } = await alice.rpc("revoke_my_session", {
      p_session_id: "00000000-0000-0000-0000-00000000dead",
    });
    // Indistinguishable from "not yours", on purpose.
    expect(data).toBe(false);
  });
});

/**
 * The exact limit of revocation, asserted so no copy promises more than it
 * delivers -- and asserted at the layer where it is actually true.
 *
 * PostgREST verifies a JWT's signature and expiry, NOT whether the session still
 * exists, so a revoked access token keeps reading the Data API until it expires
 * (jwt_expiry, 3600s). But that window is only reachable by something holding
 * the raw token: measured here, supabase-js drops its session the moment GoTrue
 * answers `session_not_found`, and every subsequent call falls back to the anon
 * key. A revoked device running this SDK loses access at once.
 *
 * So the raw fetch below is not a pedantic detail -- it is the only way to state
 * the limitation truthfully, and going through the SDK instead would have
 * asserted the opposite of what is true.
 */
describe("what revocation does not do", () => {
  it("leaves a raw revoked token reading the Data API until it expires", async () => {
    const deviceA = await signInAs(SEEDED_USERS.alice);
    const deviceB = await signInAs(SEEDED_USERS.alice);

    const { data: sessionB } = await deviceB.auth.getSession();
    // Captured BEFORE revocation, because the SDK will discard it after.
    const rawToken = sessionB.session!.access_token;
    const idB = JSON.parse(Buffer.from(rawToken.split(".")[1], "base64").toString()).session_id;

    await deviceA.rpc("revoke_my_session", { p_session_id: idB });

    expect((await deviceB.auth.getUser()).error).not.toBeNull();

    const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${rawToken}` },
    });
    // Documented, not desired. Narrowing it means lowering jwt_expiry, which is a
    // product-wide decision and not this migration's to make.
    expect(response.status).toBe(200);
  });

  it("does drop the SDK's session, so a revoked device stops reading immediately", async () => {
    const deviceA = await signInAs(SEEDED_USERS.alice);
    const deviceB = await signInAs(SEEDED_USERS.alice);

    const { data: sessionB } = await deviceB.auth.getSession();
    const idB = JSON.parse(
      Buffer.from(sessionB.session!.access_token.split(".")[1], "base64").toString(),
    ).session_id;
    await deviceA.rpc("revoke_my_session", { p_session_id: idB });
    await deviceB.auth.getUser();

    // Falls back to the anon key, which holds no SELECT on profiles.
    const { error } = await deviceB.from("profiles").select("id").limit(1);
    expect(error).not.toBeNull();
  });
});

describe("revoke_all_my_sessions", () => {
  /**
   * The other half of S2's named edge case: sign-out-everywhere, seen from the
   * devices it ends. Both of this member's devices die, and nobody else's does.
   */
  it("ends every one of the caller's sessions and none of anyone else's", async () => {
    const deviceA = await signInAs(SEEDED_USERS.alice);
    const deviceB = await signInAs(SEEDED_USERS.alice);
    const bob = await signInAs(SEEDED_USERS.bob);

    const { data: count, error } = await deviceA.rpc("revoke_all_my_sessions");
    expect(error).toBeNull();
    expect(count as number).toBeGreaterThanOrEqual(2);

    expect((await deviceA.auth.getUser()).error).not.toBeNull();
    expect((await deviceB.auth.getUser()).error).not.toBeNull();
    // A bulk revoke is the easiest place to delete too much.
    expect((await bob.auth.getUser()).error).toBeNull();
  });

  it("is unreachable without a session", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("revoke_all_my_sessions");
    expect(error).not.toBeNull();
  });
});
