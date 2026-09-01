import { describe, expect, it } from "vitest";
import { SEEDED_USERS, TEST_CAPTCHA, createAnonClient } from "./helpers";

/**
 * Captcha enforcement, against a real GoTrue (S2, PR 4).
 *
 * This is the file that would have caught S1's hosted-SMTP class of problem: a
 * configuration that looks enabled in the repo and is enforced nowhere. Every
 * assertion below is a request to the running auth container, not a read of
 * config.toml -- tests/turnstile.test.tsx already covers the file's contents,
 * and a config file agreeing with itself proves nothing.
 *
 * Why a dummy token is enough: [auth.captcha] points at Cloudflare's published
 * always-passes TEST secret, which verifies any non-empty response string. The
 * enforcement being asserted is GoTrue's ("is a token present and does it
 * verify"), not Cloudflare's scoring.
 */
describe("GoTrue refuses a captcha-guarded call with no token", () => {
  const stamp = Date.now();

  it("refuses signup", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.auth.signUp({
      email: `captcha-signup-${stamp}@f4milia.test`,
      password: "password123",
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("captcha_failed");
    expect(data.user).toBeNull();
  });

  it("refuses password sign-in", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.auth.signInWithPassword(SEEDED_USERS.alice);

    expect(error).not.toBeNull();
    expect(error!.code).toBe("captcha_failed");
    expect(data.session).toBeNull();
  });

  it("refuses a magic-link request", async () => {
    const anon = createAnonClient();
    const { error } = await anon.auth.signInWithOtp({
      email: SEEDED_USERS.alice.email,
      options: { shouldCreateUser: false },
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("captcha_failed");
  });

  it("refuses a password-reset request", async () => {
    const anon = createAnonClient();
    const { error } = await anon.auth.resetPasswordForEmail(SEEDED_USERS.alice.email);

    expect(error).not.toBeNull();
    expect(error!.code).toBe("captcha_failed");
  });
});

describe("with a token, the same calls proceed", () => {
  /**
   * The other half, and the half that makes the four above meaningful: they
   * must fail for the captcha, not because the request was malformed or the
   * credentials were wrong.
   */
  it("password sign-in succeeds", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.auth.signInWithPassword({
      ...SEEDED_USERS.alice,
      options: TEST_CAPTCHA,
    });

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
  });

  /**
   * The credential path still reaches GoTrue's own checks rather than stopping
   * at the captcha: a wrong password with a VALID token must fail as
   * invalid_credentials. Without this, "captcha enabled" could be masking every
   * other auth failure behind one generic error.
   */
  it("a wrong password with a valid token still fails as invalid_credentials", async () => {
    const anon = createAnonClient();
    const { error } = await anon.auth.signInWithPassword({
      email: SEEDED_USERS.alice.email,
      password: "not-the-password",
      options: TEST_CAPTCHA,
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("invalid_credentials");
  });
});

/**
 * The admin API is deliberately NOT captcha-guarded, and tests/isolation
 * depends on that: signUpNewUser creates accounts through it. Asserted so that
 * dependency is explicit rather than an accident nobody wrote down.
 */
describe("the admin API is not captcha-guarded", () => {
  it("creates a user with no token at all", async () => {
    const { createServiceRoleClient } = await import("./helpers");
    const service = createServiceRoleClient();
    const { data, error } = await service.auth.admin.createUser({
      email: `captcha-admin-${Date.now()}@f4milia.test`,
      password: "password123",
      email_confirm: true,
    });

    expect(error).toBeNull();
    expect(data.user).not.toBeNull();
  });
});
