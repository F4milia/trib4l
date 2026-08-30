import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reset flow's decisions, all of them about refusing to do something.
 */

const redirected = vi.hoisted(() => ({ to: null as string | null }));

/**
 * The actions now read the request origin to tell each emailed link where to
 * come back to, so they need a request context. Supplying one rather than
 * relaxing any assertion below.
 */
vi.mock("next/headers", () => ({
  headers: async () => new Map([["origin", "http://localhost:3000"]]),
}));

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
   * The action now returns field-scoped state instead of redirecting with a
   * message in the URL. Every assertion below is the one it always made --
   * only the shape of the answer changed.
   */

  /**
   * /reset-password is a plain URL. Someone who never opened a recovery link
   * can post to this action directly, and must not be able to set a password
   * on any account by doing so.
   *
   * This one still REDIRECTS rather than returning state: the answer is a
   * different page. They need a new link, not a corrected field.
   */
  it("sets nothing when there is no session", async () => {
    auth.getUser.mockResolvedValue(signedOut);
    await expect(
      updatePassword({}, form({ password: "newpassword", password_confirmation: "newpassword" })),
    ).rejects.toThrow();

    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(redirected.to).toMatch(/^\/forgot-password\?error=/);
  });

  it("checks the session before it looks at the fields at all", async () => {
    auth.getUser.mockResolvedValue(signedOut);
    // Deliberately mismatched: a signed-out caller must be turned away for
    // being signed out, not told which of their two passwords was wrong.
    await expect(
      updatePassword({}, form({ password: "a", password_confirmation: "b" })),
    ).rejects.toThrow();
    expect(redirected.to).toMatch(/^\/forgot-password\?/);
  });

  /**
   * Reported against the CONFIRMATION field, not the first one: the first
   * entry is what they meant, the second is the one that disagrees with it.
   */
  it("refuses a mismatch against the confirmation field, and writes nothing", async () => {
    const state = await updatePassword(
      {},
      form({ password: "newpassword", password_confirmation: "different" }),
    );

    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(state.fieldErrors?.passwordConfirmation).toBeTruthy();
    expect(state.fieldErrors?.password).toBeUndefined();
    expect(state.formError).toBeUndefined();
    expect(redirected.to).toBeNull();
  });

  it("refuses an empty field against that field, and writes nothing", async () => {
    const state = await updatePassword({}, form({ password: "", password_confirmation: "" }));
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(state.fieldErrors?.password).toBeTruthy();
  });

  it("names the confirmation field when only the confirmation is missing", async () => {
    const state = await updatePassword({}, form({ password: "newpassword", password_confirmation: "" }));
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(state.fieldErrors?.passwordConfirmation).toBeTruthy();
  });

  /**
   * updateUser applies to the session's own user and nobody else's, so there
   * is no account id in the form to tamper with -- but assert that the action
   * passes only the password, in case a later edit adds a field to this call.
   */
  it("sets the password on the session's own user, passing nothing else", async () => {
    await expect(
      updatePassword({}, form({ password: "newpassword", password_confirmation: "newpassword" })),
    ).rejects.toThrow();

    expect(auth.updateUser).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "newpassword" });
    expect(redirected.to).toBe("/");
  });

  it("ignores an account id smuggled into the form", async () => {
    await expect(
      updatePassword(
        {},
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

  /** A weak password comes back on the password field, not as a form error. */
  it("puts a rejected-as-weak password under the password field", async () => {
    auth.updateUser.mockResolvedValue({
      data: {},
      error: { code: "weak_password", message: "Password should be at least 6 characters.", status: 422 },
    });
    const state = await updatePassword({}, form({ password: "abc", password_confirmation: "abc" }));
    expect(state.fieldErrors?.password).toBeTruthy();
    expect(state.formError).toBeUndefined();
  });

  /** Anything unmapped falls back to a form-level message, never a guess. */
  it("falls back to a form-level message for an unmapped failure", async () => {
    auth.updateUser.mockResolvedValue({
      data: {},
      error: { code: "over_request_rate_limit", message: "Too many requests", status: 429 },
    });
    const state = await updatePassword({}, form({ password: "newpassword", password_confirmation: "newpassword" }));
    expect(state.formError).toBeTruthy();
    expect(state.fieldErrors).toBeUndefined();
  });
});
