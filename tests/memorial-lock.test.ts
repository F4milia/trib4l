import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEMORIAL_LOCK, memorialSignInBlocked } from "@/lib/auth/memorial-lock";

/**
 * Memorial-lock's app half.
 *
 * The database half — who may set it, that the name is never scrubbed, that a
 * deletion request is refused — is in
 * supabase/tests/database/090_memorial_lock.sql, which is where it belongs:
 * those are properties of the functions, and pgTAP can impersonate a staff JWT.
 *
 * These assertions cover the four freeze toggles and the one surface that
 * enforces any of them today. They deliberately READ the policy object rather
 * than restating its values, except where a value is the thing being asserted —
 * so a product decision that flips a toggle moves the tests with it instead of
 * breaking them.
 */

const maybeSingle = vi.hoisted(() => vi.fn());
const getAuthenticatorAssuranceLevel = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() =>
  vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
);

const supabase = {
  auth: { mfa: { getAuthenticatorAssuranceLevel } },
  rpc,
  from,
} as never;

const { accountGate, MEMORIAL_PATH, DELETED_PATH } = await import("@/lib/auth/assurance");

beforeEach(() => {
  maybeSingle.mockReset().mockResolvedValue({
    data: { deleted_at: null, memorialized_at: null },
    error: null,
  });
  getAuthenticatorAssuranceLevel
    .mockReset()
    .mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
  rpc.mockReset().mockResolvedValue({ data: false, error: null });
});

describe("the four freeze toggles", () => {
  /**
   * The decisions of 2026-09-01, pinned. If one of these fails, someone changed
   * a product rule — which is allowed, but it should be a deliberate edit here
   * and not a side effect of something else.
   */
  it("holds the answers taken on 2026-09-01", () => {
    expect(MEMORIAL_LOCK.signInAllowed).toBe(false);
    expect(MEMORIAL_LOCK.familyMayComment).toBe(true);
    expect(MEMORIAL_LOCK.removableFromRoster).toBe(false);
    expect(MEMORIAL_LOCK.memberCardEditable).toBe(false);
  });

  it("keeps all four in one object, so a change is one edit", () => {
    expect(Object.keys(MEMORIAL_LOCK).sort()).toEqual([
      "familyMayComment",
      "memberCardEditable",
      "removableFromRoster",
      "signInAllowed",
    ]);
  });
});

describe("memorialSignInBlocked", () => {
  it("blocks a memorialised profile", () => {
    expect(memorialSignInBlocked({ memorialized_at: "2026-09-01T00:00:00Z" })).toBe(true);
  });

  it("leaves an ordinary profile alone", () => {
    expect(memorialSignInBlocked({ memorialized_at: null })).toBe(false);
  });

  /**
   * The reason this is a function and not `Boolean(profile.memorialized_at)` at
   * the call site: if the policy ever allows sign-in, every caller stops blocking
   * without an edit.
   */
  it("follows the policy rather than the column", () => {
    const stillBlocked = memorialSignInBlocked({ memorialized_at: "2026-09-01T00:00:00Z" });
    expect(stillBlocked).toBe(!MEMORIAL_LOCK.signInAllowed);
  });
});

describe("the gate", () => {
  it("refuses a memorialised account, with its own message", async () => {
    maybeSingle.mockResolvedValue({
      data: { deleted_at: null, memorialized_at: "2026-09-01T00:00:00Z" },
      error: null,
    });
    await expect(accountGate(supabase, "user-1")).resolves.toEqual({
      ok: false,
      redirectTo: MEMORIAL_PATH,
    });
  });

  /**
   * Both states can be true at once: somebody who anonymised themselves while
   * alive and was memorialised afterwards. Memorial-lock is the truer thing to
   * say to whoever holds the password, so it wins the message. Both refuse
   * either way, so nothing turns on it but the wording.
   */
  it("says memorialised rather than deleted when an account is both", async () => {
    maybeSingle.mockResolvedValue({
      data: { deleted_at: "2026-08-01T00:00:00Z", memorialized_at: "2026-09-01T00:00:00Z" },
      error: null,
    });
    const outcome = await accountGate(supabase, "user-1");
    expect(outcome).toEqual({ ok: false, redirectTo: MEMORIAL_PATH });
    expect(MEMORIAL_PATH).not.toBe(DELETED_PATH);
  });

  it("still refuses a merely deleted account", async () => {
    maybeSingle.mockResolvedValue({
      data: { deleted_at: "2026-08-01T00:00:00Z", memorialized_at: null },
      error: null,
    });
    await expect(accountGate(supabase, "user-1")).resolves.toEqual({
      ok: false,
      redirectTo: DELETED_PATH,
    });
  });

  it("lets an ordinary account through", async () => {
    await expect(accountGate(supabase, "user-1")).resolves.toEqual({ ok: true });
  });

  /**
   * Refused before the two-factor question is even asked. A memorialised account
   * has nothing to enrol and nobody to prompt.
   */
  it("does not ask a memorialised account for a code", async () => {
    maybeSingle.mockResolvedValue({
      data: { deleted_at: null, memorialized_at: "2026-09-01T00:00:00Z" },
      error: null,
    });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    await accountGate(supabase, "user-1");
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });
});

describe("the copy", () => {
  it("says what is true and does not invite a retry", async () => {
    const { copy } = await import("@/lib/copy");
    const text = copy.memorial.signInRefused.toLowerCase();

    expect(text).toContain("memorialised");
    expect(text).toContain("stays as it is");
    // No apology, no "try again" -- they cannot, and nothing went wrong.
    expect(text).not.toContain("sorry");
    expect(text).not.toContain("try again");
    // No invented legal wording, per invariant 11.
    for (const word of ["shall", "hereby", "warrant", "liable"]) {
      expect(text).not.toContain(word);
    }
  });
});
