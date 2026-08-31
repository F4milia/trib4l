import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two decisions inside sendMagicLink that a reviewer cannot see by reading
 * the screen, and that no isolation test would catch either -- both are about
 * what the action does NOT do.
 */

const redirected = vi.hoisted(() => ({ to: null as string | null }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected.to = to;
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const signInWithOtp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOtp } }),
}));

const { sendMagicLink } = await import("@/app/actions/auth");

function form(email: string | null) {
  const fd = new FormData();
  if (email !== null) fd.set("email", email);
  return fd;
}

beforeEach(() => {
  redirected.to = null;
  signInWithOtp.mockReset();
  signInWithOtp.mockResolvedValue({ data: {}, error: null });
});

describe("sendMagicLink", () => {
  /**
   * The load-bearing option. Left at its default, signInWithOtp CREATES an
   * account for an unknown address -- a second signup path that never shows,
   * and never records, the platform-access acknowledgement /signup requires.
   */
  it("never creates an account", async () => {
    await expect(sendMagicLink(form("someone@f4milia.test"))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ shouldCreateUser: false }) }),
    );
  });

  /**
   * With creation off, GoTrue returns a distinguishable error for an address
   * that has no account. Passing it through would make this form an
   * enumeration oracle: submit an address, learn whether that person is on the
   * platform. Both outcomes must be indistinguishable from the outside.
   */
  it("answers identically whether or not the address has an account", async () => {
    await expect(sendMagicLink(form("known@f4milia.test"))).rejects.toThrow(/NEXT_REDIRECT/);
    const known = redirected.to;

    signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: "Signups not allowed for otp", code: "otp_disabled", status: 422 },
    });
    await expect(sendMagicLink(form("unknown@f4milia.test"))).rejects.toThrow(/NEXT_REDIRECT/);

    expect(redirected.to).toBe(known);
    expect(redirected.to).toBe("/link-sent");
  });

  it("does not put the address in the URL it redirects to", async () => {
    await expect(sendMagicLink(form("someone@f4milia.test"))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirected.to).not.toContain("someone");
    expect(redirected.to).not.toContain("%40");
  });

  it("refuses an empty submission without calling out to GoTrue at all", async () => {
    await expect(sendMagicLink(form(""))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(redirected.to).toMatch(/^\/magic-link\?error=/);
  });

  it("treats whitespace as empty", async () => {
    await expect(sendMagicLink(form("   "))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("trims the address before sending it", async () => {
    await expect(sendMagicLink(form("  spaced@f4milia.test  "))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "spaced@f4milia.test" }),
    );
  });
});
