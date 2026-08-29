import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reset flow's decisions, all of them about refusing to do something.
 */

const redirected = vi.hoisted(() => ({ to: null as string | null }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected.to = to;
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));

const { requestPasswordReset, updatePassword } = await import("@/app/actions/auth");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const signedIn = { data: { user: { id: "u1", email: "alice@f4milia.test" } }, error: null };
const signedOut = { data: { user: null }, error: null };

beforeEach(() => {
  redirected.to = null;
  auth.resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.getUser.mockReset().mockResolvedValue(signedIn);
  auth.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe("requestPasswordReset", () => {
  it("answers identically whether or not the address has an account", async () => {
    await expect(requestPasswordReset(form({ email: "known@f4milia.test" }))).rejects.toThrow();
    const known = redirected.to;

    auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: "User not found", status: 404 },
    });
    await expect(requestPasswordReset(form({ email: "unknown@f4milia.test" }))).rejects.toThrow();

    expect(redirected.to).toBe(known);
    expect(redirected.to).toBe("/reset-sent");
  });

  it("does not put the address in the URL it redirects to", async () => {
    await expect(requestPasswordReset(form({ email: "alice@f4milia.test" }))).rejects.toThrow();
    expect(redirected.to).not.toContain("alice");
    expect(redirected.to).not.toContain("%40");
  });

  it("refuses an empty submission without calling out to GoTrue", async () => {
    await expect(requestPasswordReset(form({ email: "   " }))).rejects.toThrow();
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(redirected.to).toMatch(/^\/forgot-password\?error=/);
  });
});

describe("updatePassword", () => {
  /**
   * /reset-password is a plain URL. Someone who never opened a recovery link
   * can post to this action directly, and must not be able to set a password
   * on any account by doing so.
   */
  it("sets nothing when there is no session", async () => {
    auth.getUser.mockResolvedValue(signedOut);
    await expect(
      updatePassword(form({ password: "newpassword", password_confirmation: "newpassword" })),
    ).rejects.toThrow();

    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(redirected.to).toMatch(/^\/forgot-password\?error=/);
  });

  it("checks the session before it looks at the fields at all", async () => {
    auth.getUser.mockResolvedValue(signedOut);
    // Deliberately mismatched: a signed-out caller must be turned away for
    // being signed out, not told which of their two passwords was wrong.
    await expect(updatePassword(form({ password: "a", password_confirmation: "b" }))).rejects.toThrow();
    expect(redirected.to).toMatch(/^\/forgot-password\?/);
  });

  it("refuses a mismatch, and writes nothing", async () => {
    await expect(
      updatePassword(form({ password: "newpassword", password_confirmation: "different" })),
    ).rejects.toThrow();

    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(redirected.to).toMatch(/^\/reset-password\?error=/);
  });

  it("refuses an empty field, and writes nothing", async () => {
    await expect(updatePassword(form({ password: "", password_confirmation: "" }))).rejects.toThrow();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  /**
   * updateUser applies to the session's own user and nobody else's, so there
   * is no account id in the form to tamper with -- but assert that the action
   * passes only the password, in case a later edit adds a field to this call.
   */
  it("sets the password on the session's own user, passing nothing else", async () => {
    await expect(
      updatePassword(form({ password: "newpassword", password_confirmation: "newpassword" })),
    ).rejects.toThrow();

    expect(auth.updateUser).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "newpassword" });
    expect(redirected.to).toBe("/");
  });

  it("ignores an account id smuggled into the form", async () => {
    await expect(
      updatePassword(
        form({
          password: "newpassword",
          password_confirmation: "newpassword",
          id: "00000000-0000-0000-0000-0000000000a3",
          email: "carol@f4milia.test",
        }),
      ),
    ).rejects.toThrow();

    expect(auth.updateUser).toHaveBeenCalledWith({ password: "newpassword" });
  });
});
