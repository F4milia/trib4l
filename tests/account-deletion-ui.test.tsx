import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Account deletion's action, its refusal at sign-in, and its copy (S2, PR 10).
 *
 * The policy itself is proven in supabase/tests/database/080_delete_my_account.sql
 * against seeded data. What is asserted here is the app's part: that the action
 * adds no second copy of a rule the function already enforces, that a deleted
 * account cannot get past requireUser(), and that the consequences list tells the
 * truth about a policy which keeps content.
 */

const rpc = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());
const getAuthenticatorAssuranceLevel = vi.hoisted(() => vi.fn());

const from = vi.hoisted(() =>
  vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
  })),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from,
    auth: { getUser, signOut, mfa: { getAuthenticatorAssuranceLevel } },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const { deleteAccount } = await import("@/app/actions/account");
const { requireUser } = await import("@/lib/session");
const { copy } = await import("@/lib/copy");
const { ConfirmSubmit } = await import("@/components/confirm-submit");

const t = copy.deleteAccount;

beforeEach(() => {
  /**
   * Per-function, not one blanket value. A mock answering `true` to everything
   * made `is_platform_staff` true as well, so the two-factor gate redirected a
   * perfectly live account to enrolment and the "lets a live profile through"
   * assertion failed on the mock rather than on the code.
   */
  rpc.mockReset().mockImplementation(async (fn: string) => {
    if (fn === "is_platform_staff") return { data: false, error: null };
    return { data: true, error: null };
  });
  signOut.mockReset().mockResolvedValue({ error: null });
  maybeSingle.mockReset().mockResolvedValue({ data: { deleted_at: null }, error: null });
  getAuthenticatorAssuranceLevel
    .mockReset()
    .mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
  getUser.mockReset().mockResolvedValue({
    data: { user: { id: "user-1", email: "a@f4milia.test", email_confirmed_at: "2026-01-01" } },
    error: null,
  });
});

describe("deleteAccount", () => {
  it("calls the one function that performs the whole policy", async () => {
    await expect(deleteAccount()).rejects.toThrow("NEXT_REDIRECT:/login?deleted=1");
    expect(rpc).toHaveBeenCalledWith("delete_my_account");
  });

  /**
   * Nothing else touches the database. Every step of the policy, the session
   * revoke and the audit row happen inside the function's transaction; a second
   * copy of any of it here would be the app-layer duplication invariant 5 warns
   * about, and could half-succeed.
   */
  it("performs no part of the policy itself", async () => {
    await expect(deleteAccount()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("clears only this browser's cookies, since the sessions are already gone", async () => {
    await expect(deleteAccount()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps the person on the page, and says nothing changed, if it failed", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(deleteAccount()).rejects.toThrow(/\/settings\/account\?error=/);
    // The message must not imply a partial deletion, because there was none.
    expect(t.errors.failed).toContain("Nothing has changed");
    expect(signOut).not.toHaveBeenCalled();
  });

  /**
   * `false` means the profile already carried deleted_at. Onward is right -- the
   * account IS deleted -- but claiming this request did it would be false.
   */
  it("distinguishes an already-deleted account from one it just deleted", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(deleteAccount()).rejects.toThrow("NEXT_REDIRECT:/login?deleted=already");
  });

  it("sends a signed-out caller to sign in without calling anything", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(deleteAccount()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("a deleted account cannot get back in", () => {
  /**
   * This check is the only thing standing between a deleted account and being
   * used again: profiles.id cascades from auth.users, so the GoTrue user has to
   * survive -- with its password intact. Deletion revoked the sessions; it did
   * not remove the credential, and GoTrue will authenticate it happily.
   */
  it("refuses a profile carrying deleted_at", async () => {
    maybeSingle.mockResolvedValue({ data: { deleted_at: "2026-09-01T00:00:00Z" }, error: null });
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login?deleted=already");
  });

  it("lets a live profile through", async () => {
    await expect(requireUser()).resolves.toMatchObject({ user: { id: "user-1" } });
  });

  /**
   * Checked BEFORE the two-factor gate: an account that no longer exists should
   * not be asked for a code. Asserted by the gate never being consulted.
   */
  it("is refused before being asked for a two-factor code", async () => {
    maybeSingle.mockResolvedValue({ data: { deleted_at: "2026-09-01T00:00:00Z" }, error: null });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    await expect(requireUser()).rejects.toThrow(/deleted=already/);
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });
});

describe("the consequences list tells the truth about the policy", () => {
  const all = t.consequences.join(" ").toLowerCase();

  /**
   * The retention policy KEEPS content and severs the person from it. Somebody
   * expecting "delete" to mean "erase everything I wrote" would be misled by a
   * shorter list, so this one has to say what stays -- and that is the assertion
   * most likely to be quietly softened later.
   */
  it("says what stays, not only what goes", () => {
    expect(all).toContain("stays where it is");
    expect(all).toContain("keep their records");
  });

  it("says there is no undo, because there is none", () => {
    expect(all).toContain("no undo");
  });

  it("says sign-in is impossible afterwards", () => {
    expect(all).toContain("cannot sign in again");
  });

  /**
   * "Anonymize" is our word for the policy, not a description anyone can act on.
   */
  it("uses no internal vocabulary", () => {
    expect(all).not.toContain("anonymi");
    expect(all).not.toContain("soft delete");
    expect(all).not.toContain("purge");
  });
});

describe("the confirmation", () => {
  it("names every consequence before the destructive submit", () => {
    render(
      <ConfirmSubmit
        action={() => {}}
        trigger={t.trigger}
        title={t.dialogTitle}
        consequences={t.consequences}
        confirmLabel={t.confirm}
      />,
    );
    for (const line of t.consequences) {
      expect(screen.getByText(line)).toBeTruthy();
    }
  });
});
