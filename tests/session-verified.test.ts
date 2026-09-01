import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * requireUser's verification branch. It cannot be exercised from
 * tests/isolation -- that suite talks to a real GoTrue, and a real GoTrue
 * refuses to mint the very session this branch exists to catch. So the
 * session is supplied here directly, which is the only way to ask "and if one
 * ever did arrive?"
 */

const redirected = vi.hoisted(() => ({ to: null as string | null }));

vi.mock("next/navigation", () => ({
  // The real redirect() throws to unwind the render; mirroring that is what
  // makes the assertions meaningful -- a mock that returned normally would let
  // execution fall through to the `return` and hide a missing guard.
  redirect: (to: string) => {
    redirected.to = to;
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const getUser = vi.hoisted(() => vi.fn());
/**
 * S2 put a two-factor gate inside requireUser(), after the getUser() call these
 * tests are about. So the client now needs the two things the gate reads.
 *
 * Both answer "nothing to enforce here": no verified factor, and not staff --
 * which is the state every assertion in this file already assumed. Nothing is
 * weakened; the collaborator simply did not exist when the file was written. The
 * gate has its own coverage in tests/assurance-gate.test.ts and in
 * tests/e2e/staff-2fa.spec.ts.
 */
const getAuthenticatorAssuranceLevel = vi.hoisted(() =>
  vi.fn(async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null })),
);
const rpc = vi.hoisted(() => vi.fn(async () => ({ data: false, error: null })));

/**
 * S2 also made requireUser() refuse a profile carrying deleted_at, which is one
 * primary-key lookup on profiles. This answers "a live profile", the state every
 * assertion in this file already assumed. The refusal itself is asserted in
 * tests/account-deletion-ui.test.tsx.
 */
const maybeSingle = vi.hoisted(() =>
  vi.fn(async () => ({ data: { deleted_at: null }, error: null })),
);
const from = vi.hoisted(() =>
  vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser, mfa: { getAuthenticatorAssuranceLevel } },
    rpc,
    from,
  }),
}));

const { requireUser } = await import("@/lib/session");

function session(user: Record<string, unknown> | null) {
  getUser.mockResolvedValue({ data: { user }, error: null });
}

beforeEach(() => {
  redirected.to = null;
  getUser.mockReset();
});

describe("requireUser", () => {
  it("sends a signed-out visitor to sign in", async () => {
    session(null);
    await expect(requireUser()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirected.to).toBe("/login");
  });

  it("lets a confirmed user through", async () => {
    session({ id: "u1", email: "alice@f4milia.test", email_confirmed_at: "2026-08-30T00:00:00Z" });
    const { user } = await requireUser();
    expect(user.id).toBe("u1");
    expect(redirected.to).toBeNull();
  });

  /**
   * The whole point of the branch: a session whose address was never
   * confirmed reaches no page that calls requireUser -- which is every page
   * under /o/[slug], every settings surface, and (through
   * requirePlatformAdmin) the admin surfaces.
   */
  it("stops a session whose address was never confirmed", async () => {
    session({ id: "u2", email: "unconfirmed@f4milia.test", email_confirmed_at: null });
    await expect(requireUser()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirected.to).toBe("/check-email");
  });

  it("treats an absent email_confirmed_at field the same as null", async () => {
    session({ id: "u3", email: "unconfirmed@f4milia.test" });
    await expect(requireUser()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirected.to).toBe("/check-email");
  });

  /**
   * A session with no address at all is a different state with a different
   * answer, and `email_optional = false` keeps it unreachable today. Sending
   * such a person to "check your email" would be advice they cannot act on.
   */
  it("does not send a user with no address to check their email", async () => {
    session({ id: "u4", email: null, email_confirmed_at: null });
    const { user } = await requireUser();
    expect(user.id).toBe("u4");
    expect(redirected.to).toBeNull();
  });
});
