import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHALLENGE_PATH, ENROL_PATH, assuranceOutcome } from "@/lib/auth/assurance";

/**
 * The gate's decision table (S2, PR 8).
 *
 * Behaviour through the product is proven in tests/e2e/staff-2fa.spec.ts with
 * real accounts and real codes. This file covers the branches, including the one
 * that costs a database round trip and the one that must NOT.
 */

const getAuthenticatorAssuranceLevel = vi.fn();
const rpc = vi.fn();

// Only the two members the gate touches; typed loosely on purpose, since a full
// SupabaseClient is not what is under test here.
const supabase = {
  auth: { mfa: { getAuthenticatorAssuranceLevel } },
  rpc,
} as unknown as Parameters<typeof assuranceOutcome>[0];

function levels(currentLevel: string | null, nextLevel: string | null) {
  getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel, nextLevel },
    error: null,
  });
}

beforeEach(() => {
  getAuthenticatorAssuranceLevel.mockReset();
  rpc.mockReset().mockResolvedValue({ data: false, error: null });
});

describe("a member with no authenticator", () => {
  it("passes", async () => {
    levels("aal1", "aal1");
    await expect(assuranceOutcome(supabase)).resolves.toEqual({ ok: true });
  });
});

describe("anyone holding a verified authenticator", () => {
  /**
   * The branch that makes two-factor mean anything. GoTrue issues an aal1
   * session for a correct password whether or not a factor exists; deciding
   * aal1 is not enough is the application's job and nowhere else.
   */
  it("must present a code when the session is still aal1", async () => {
    levels("aal1", "aal2");
    await expect(assuranceOutcome(supabase)).resolves.toEqual({
      ok: false,
      reason: "code-required",
      redirectTo: CHALLENGE_PATH,
    });
  });

  it("passes once a code has been presented", async () => {
    levels("aal2", "aal2");
    await expect(assuranceOutcome(supabase)).resolves.toEqual({ ok: true });
  });

  /**
   * No staff lookup on this path, and that is a deliberate cost decision: the
   * answer cannot change the outcome, and this branch runs on every request from
   * everyone who has enrolled.
   */
  it("does not ask the database whether they are staff", async () => {
    levels("aal1", "aal2");
    await assuranceOutcome(supabase);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("platform staff with no authenticator", () => {
  it("is sent to enrolment", async () => {
    levels("aal1", "aal1");
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(assuranceOutcome(supabase)).resolves.toEqual({
      ok: false,
      reason: "staff-must-enrol",
      redirectTo: ENROL_PATH,
    });
  });

  /**
   * Resolved server-side from the database, per CLAUDE.md -- never from a claim
   * on the session, which is what a caller could influence.
   */
  it("resolves staff from the database, not from the session", async () => {
    levels("aal1", "aal1");
    rpc.mockResolvedValue({ data: true, error: null });
    await assuranceOutcome(supabase);
    expect(rpc).toHaveBeenCalledWith("is_platform_staff");
  });

  /**
   * Staff who HAVE verified this session are simply through -- being staff is not
   * a reason to keep asking. Covered because it is the state every staff member
   * spends their working day in.
   */
  it("passes once verified, with no further questions", async () => {
    levels("aal2", "aal2");
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(assuranceOutcome(supabase)).resolves.toEqual({ ok: true });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("when the levels cannot be read", () => {
  /**
   * Fails OPEN for a member and CLOSED for staff, which is the same rule the
   * rest of the gate follows rather than an exception: with no factor and no
   * staff row there is nothing to enforce, and the database is still asked about
   * staff before anyone is let through on this path.
   */
  it("still asks about staff", async () => {
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: "nope" } });
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(assuranceOutcome(supabase)).resolves.toMatchObject({
      reason: "staff-must-enrol",
    });
  });

  it("lets an ordinary member through rather than stranding them", async () => {
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(assuranceOutcome(supabase)).resolves.toEqual({ ok: true });
  });
});
