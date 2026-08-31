import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNUP_FIELD_BY_CODE, signupFieldForCode } from "@/lib/auth/form-errors";
import { copy } from "@/lib/copy";

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

const auth = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));

const { signIn, signUp } = await import("@/app/actions/auth");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const GOOD_SIGNUP = { email: "new@f4milia.test", password: "password123", consent: "on" };

beforeEach(() => {
  redirected.to = null;
  auth.signUp.mockReset().mockResolvedValue({ data: { user: {}, session: null }, error: null });
  auth.signInWithPassword.mockReset().mockResolvedValue({ data: { session: {} }, error: null });
});

/* -------------------------------------------------------------------------- */
/* Sign-in: never attributable, by construction                               */
/* -------------------------------------------------------------------------- */

describe("signIn", () => {
  /**
   * Probed against a real GoTrue on 2026-08-30: a wrong password, an unknown
   * address, a malformed address and an empty one ALL return the identical
   * `invalid_credentials`. The server cannot tell which field was wrong, and
   * the only way to find out would be to ask whether the address has an
   * account -- the enumeration oracle /magic-link and /forgot-password are
   * both built to avoid. So this must never become a field error.
   */
  it("keeps a credential failure at form level, naming neither field", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 },
    });

    const state = await signIn({}, form({ email: "someone@f4milia.test", password: "wrong" }));

    expect(state.formError).toBe(copy.auth.login.errors.invalidCredentials);
    expect(state.fieldErrors).toBeUndefined();
  });

  it("says nothing about whether the address has an account", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 },
    });

    const state = await signIn({}, form({ email: "someone@f4milia.test", password: "wrong" }));
    const message = state.formError!.toLowerCase();

    for (const giveaway of ["no account", "not found", "unknown", "does not exist", "incorrect password", "wrong password"]) {
      expect(message, `"${giveaway}" would attribute the failure`).not.toContain(giveaway);
    }
  });

  /** Ours to attribute, so attributed -- and without asking GoTrue anything. */
  it("names the empty field, and does not call out at all", async () => {
    const noEmail = await signIn({}, form({ email: "  ", password: "x" }));
    expect(noEmail.fieldErrors?.email).toBeTruthy();

    const noPassword = await signIn({}, form({ email: "a@b.test", password: "" }));
    expect(noPassword.fieldErrors?.password).toBeTruthy();

    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("redirects home on success", async () => {
    await expect(signIn({}, form({ email: "a@b.test", password: "x" }))).rejects.toThrow();
    expect(redirected.to).toBe("/");
  });
});

/* -------------------------------------------------------------------------- */
/* Sign-up: attributable, and one code deliberately swallowed                  */
/* -------------------------------------------------------------------------- */

describe("signUp", () => {
  it.each([
    ["email", { ...GOOD_SIGNUP, email: "" }],
    ["password", { ...GOOD_SIGNUP, password: "" }],
    ["consent", { email: GOOD_SIGNUP.email, password: GOOD_SIGNUP.password }],
  ])("names the %s field when it is the one at fault", async (field, fields) => {
    const state = await signUp({}, form(fields));
    expect(state.fieldErrors?.[field as "email"]).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("puts a weak password under the password field", async () => {
    auth.signUp.mockResolvedValue({
      data: {},
      error: { code: "weak_password", message: "Password should be at least 6 characters.", status: 422 },
    });
    const state = await signUp({}, form(GOOD_SIGNUP));
    expect(state.fieldErrors?.password).toBe(copy.auth.signup.errors.weakPassword);
    expect(state.formError).toBeUndefined();
  });

  it("puts a malformed address under the email field", async () => {
    auth.signUp.mockResolvedValue({
      data: {},
      error: { code: "validation_failed", message: "Unable to validate email address: invalid format", status: 400 },
    });
    const state = await signUp({}, form(GOOD_SIGNUP));
    expect(state.fieldErrors?.email).toBe(copy.auth.signup.errors.invalidEmail);
  });

  /**
   * The closed set is closed in the SAFE direction: a code nobody mapped
   * becomes a form-level message rather than a guess at a field.
   */
  it("falls back to form level for an unmapped code", async () => {
    auth.signUp.mockResolvedValue({
      data: {},
      error: { code: "over_request_rate_limit", message: "Too many requests", status: 429 },
    });
    const state = await signUp({}, form(GOOD_SIGNUP));
    expect(state.formError).toBeTruthy();
    expect(state.fieldErrors).toBeUndefined();
  });

  /* ------------------------------------------------------------------ */
  /* The enumeration fix                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Measured 2026-08-30: an address with a CONFIRMED account returns
   * `user_already_exists` / "User already registered", and the previous action
   * passed error.message straight to the screen -- so /signup told any visitor
   * whether a given address was on the platform.
   */
  it("is indistinguishable for an address that already has an account", async () => {
    // A real signup redirects, so it throws NEXT_REDIRECT rather than
    // returning state.
    await expect(signUp({}, form(GOOD_SIGNUP))).rejects.toThrow();
    const freshDestination = redirected.to;

    redirected.to = null;
    auth.signUp.mockResolvedValue({
      data: {},
      error: { code: "user_already_exists", message: "User already registered", status: 422 },
    });
    await expect(signUp({}, form(GOOD_SIGNUP))).rejects.toThrow();

    expect(redirected.to).toBe(freshDestination);
    expect(redirected.to).toBe("/check-email");
  });

  it("never surfaces the words GoTrue uses for an existing account", async () => {
    auth.signUp.mockResolvedValue({
      data: {},
      error: { code: "user_already_exists", message: "User already registered", status: 422 },
    });
    await expect(signUp({}, form(GOOD_SIGNUP))).rejects.toThrow();
    expect(redirected.to).not.toMatch(/already|registered|exists/i);
  });

  /**
   * The page it lands on must be true on BOTH paths. A real signup got an
   * email; an address that already had an account got nothing. "We sent you a
   * link" would be false half the time, which is the honest-copy rule.
   */
  it("lands on copy that is conditional, not a promise that mail was sent", () => {
    expect(copy.auth.checkEmail.body).toMatch(/\bif\b/i);
    expect(copy.auth.checkEmail.body).not.toMatch(/^we sent/i);
  });
});

/* -------------------------------------------------------------------------- */
/* What survives a failed submission                                          */
/* -------------------------------------------------------------------------- */

describe("echoed values", () => {
  /**
   * The regression this exists for, found in a browser and not by this suite:
   * React 19 resets an uncontrolled `<form action>` once the action resolves,
   * so a failed submission wiped the address that had just been typed. The
   * person was then told "enter your email address" on the next attempt and
   * could never get both fields filled at once.
   *
   * jsdom does not perform that reset, so no unit test can observe the bug
   * directly. What CAN be asserted here is the mechanism that fixes it: the
   * state carries the value back, and the form applies it as defaultValue --
   * which is what the reset restores to.
   */
  it("hands the submitted address back on every sign-in failure", async () => {
    const missingPassword = await signIn({}, form({ email: "typed@f4milia.test", password: "" }));
    expect(missingPassword.values?.email).toBe("typed@f4milia.test");

    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 },
    });
    const wrongPassword = await signIn({}, form({ email: "typed@f4milia.test", password: "nope" }));
    expect(wrongPassword.values?.email).toBe("typed@f4milia.test");
  });

  it("hands the address and the acknowledgement back on a sign-up failure", async () => {
    const state = await signUp({}, form({ email: "typed@f4milia.test", password: "" }));
    expect(state.values?.email).toBe("typed@f4milia.test");

    const noConsent = await signUp({}, form({ email: "typed@f4milia.test", password: "x" }));
    expect(noConsent.values?.consent).toBe(false);

    auth.signUp.mockResolvedValue({
      data: {},
      error: { code: "weak_password", message: "too short", status: 422 },
    });
    const weak = await signUp({}, form({ ...GOOD_SIGNUP, password: "abc" }));
    expect(weak.values?.consent).toBe(true);
  });

  /**
   * The other half, and the one that matters more: a password must never come
   * back. Echoing it would render it into the markup and park it in the client
   * component tree. The type has no field for it; this asserts no path smuggles
   * one in anyway.
   */
  it("never echoes a password back, by any route", async () => {
    const SECRET = "correct-horse-battery-staple";

    const states = [
      await signIn({}, form({ email: "a@b.test", password: "" })),
      await signUp({}, form({ email: "", password: SECRET, consent: "on" })),
    ];

    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 },
    });
    states.push(await signIn({}, form({ email: "a@b.test", password: SECRET })));

    auth.signUp.mockResolvedValue({
      data: {},
      error: { code: "weak_password", message: "too short", status: 422 },
    });
    states.push(await signUp({}, form({ ...GOOD_SIGNUP, password: SECRET })));

    for (const state of states) {
      expect(JSON.stringify(state ?? {})).not.toContain(SECRET);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The mapping table itself                                                   */
/* -------------------------------------------------------------------------- */

describe("signupFieldForCode", () => {
  it.each(Object.entries(SIGNUP_FIELD_BY_CODE))("maps %s to the %s field", (code, field) => {
    expect(signupFieldForCode(code)).toBe(field);
  });

  it("refuses to attribute an unknown code", () => {
    expect(signupFieldForCode("something_new")).toBeNull();
    expect(signupFieldForCode(undefined)).toBeNull();
    expect(signupFieldForCode("")).toBeNull();
  });

  /** Attributing this one is exactly the leak the action closes. */
  it("does not map user_already_exists to a field", () => {
    expect(signupFieldForCode("user_already_exists")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Copy that has to agree with configuration                                  */
/* -------------------------------------------------------------------------- */

describe("the weak-password message", () => {
  /**
   * The message states a number. If minimum_password_length moves and this
   * does not, the app confidently tells people the wrong rule -- the same
   * class of drift as CLAUDE.md's "when you pin something, check what it pins
   * in turn".
   */
  it("states the minimum that supabase/config.toml actually enforces", () => {
    const config = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");
    const configured = config.match(/^\s*minimum_password_length\s*=\s*(\d+)/m)?.[1];
    expect(configured).toBeTruthy();

    for (const message of [copy.auth.signup.errors.weakPassword, copy.auth.resetPassword.errors.weakPassword]) {
      expect(message, `"${message}" must state ${configured}`).toContain(configured!);
    }
  });
});
