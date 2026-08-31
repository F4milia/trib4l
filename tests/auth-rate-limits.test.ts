import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S2: rate limiting on every auth endpoint.
 *
 * What this file can and cannot prove. "Five allowed, the sixth refused" is a
 * property of the counter, and it is proven against a real Postgres in
 * supabase/tests/database/060_rate_limit_counters.sql and again through
 * PostgREST in tests/isolation/rate-limit.test.ts. What only a unit test can
 * see is the wiring: that every endpoint consults the limiter, that none of
 * them reaches GoTrue once refused, that the bucket key never carries a
 * plaintext address, and that a broken store refuses rather than waves
 * everyone through.
 */

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ rpc }) }));

// A mutable header bag, so a test can change the request's apparent source.
const request = vi.hoisted(() => ({ headers: new Map<string, string>() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));

const { withinAuthRateLimit, AUTH_RATE_LIMITS } = await import("@/lib/auth/rate-limit");
const { signIn, signUp, sendMagicLink, requestPasswordReset, requestEmailChange, updatePassword } =
  await import("@/app/actions/auth");
const { copy } = await import("@/lib/copy");

const ADDRESS = "Someone@F4milia.test";
const LIMITED = copy.auth.rateLimit.tooManyAttempts;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Every bucket key handed to the database across a call. */
function buckets(): string[] {
  return rpc.mock.calls.map((call) => call[1].p_bucket as string);
}

beforeEach(() => {
  request.headers = new Map([
    ["origin", "http://localhost:3000"],
    ["x-forwarded-for", "203.0.113.7, 70.41.3.18"],
  ]);
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
  auth.signUp.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.signInWithOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.getUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id: "user-1", email: "old@f4milia.test" } }, error: null });
});

describe("withinAuthRateLimit", () => {
  it("consumes two buckets per attempt: one for the source, one for the address", async () => {
    await withinAuthRateLimit("sign-in", ADDRESS);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(buckets().filter((b) => b.startsWith("sign-in:ip:"))).toHaveLength(1);
    expect(buckets().filter((b) => b.startsWith("sign-in:id:"))).toHaveLength(1);
  });

  /**
   * The reason the key is a digest at all. A rate-limit table that accumulates
   * plaintext addresses is a standing list of everyone who has tried to sign
   * in, readable by anything that can see the function's arguments -- a
   * statement log included.
   */
  it("never puts a plaintext address in the bucket key", async () => {
    await withinAuthRateLimit("magic-link", ADDRESS);
    for (const bucket of buckets()) {
      expect(bucket).not.toContain("Someone");
      expect(bucket).not.toContain("someone");
      expect(bucket).not.toContain("@");
    }
  });

  /**
   * The two limits differ on purpose. A per-IP limit of five would lock out a
   * whole household behind one NAT address -- and a Family is 8 to 12 people
   * who may well share one.
   */
  it("limits an address harder than a source", async () => {
    await withinAuthRateLimit("sign-in", ADDRESS);
    const byPrefix = Object.fromEntries(
      rpc.mock.calls.map((call) => [
        (call[1].p_bucket as string).split(":")[1],
        { limit: call[1].p_limit, window: call[1].p_window_seconds },
      ]),
    );
    expect(byPrefix.id).toEqual({
      limit: AUTH_RATE_LIMITS.perIdentifier.limit,
      window: AUTH_RATE_LIMITS.perIdentifier.windowSeconds,
    });
    expect(byPrefix.ip).toEqual({
      limit: AUTH_RATE_LIMITS.perIp.limit,
      window: AUTH_RATE_LIMITS.perIp.windowSeconds,
    });
    expect(AUTH_RATE_LIMITS.perIdentifier.limit).toBe(5);
    expect(AUTH_RATE_LIMITS.perIp.limit).toBeGreaterThan(AUTH_RATE_LIMITS.perIdentifier.limit);
  });

  it("treats a differently-cased or padded address as the same allowance", async () => {
    await withinAuthRateLimit("sign-in", "  A@B.test ");
    const first = buckets().find((b) => b.includes(":id:"));
    rpc.mockClear();
    await withinAuthRateLimit("sign-in", "a@b.test");
    expect(buckets().find((b) => b.includes(":id:"))).toBe(first);
  });

  it("refuses when either bucket refuses", async () => {
    rpc.mockImplementation((_fn: string, args: { p_bucket: string }) =>
      Promise.resolve({ data: !args.p_bucket.includes(":id:"), error: null }),
    );
    await expect(withinAuthRateLimit("sign-in", ADDRESS)).resolves.toBe(false);
  });

  it("consumes the source bucket even when the address bucket has already refused", async () => {
    rpc.mockImplementation((_fn: string, args: { p_bucket: string }) =>
      Promise.resolve({ data: !args.p_bucket.includes(":id:"), error: null }),
    );
    await withinAuthRateLimit("sign-in", ADDRESS);
    // Otherwise a spray would be free after its first refusal.
    expect(buckets().filter((b) => b.includes(":ip:"))).toHaveLength(1);
  });

  /**
   * Fails closed. A refusal is visible and gets fixed; a limiter that has
   * silently stopped limiting is invisible until it is exploited.
   */
  it("refuses when the store returns an error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(withinAuthRateLimit("sign-in", ADDRESS)).resolves.toBe(false);
  });

  it("refuses when the store throws", async () => {
    rpc.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(withinAuthRateLimit("sign-in", ADDRESS)).resolves.toBe(false);
  });

  it("keys the source on the leftmost x-forwarded-for entry, not the proxy chain", async () => {
    await withinAuthRateLimit("sign-in");
    const withClient = buckets().find((b) => b.includes(":ip:"));
    rpc.mockClear();
    request.headers.set("x-forwarded-for", "203.0.113.7, 198.51.100.9");
    await withinAuthRateLimit("sign-in");
    expect(buckets().find((b) => b.includes(":ip:"))).toBe(withClient);
  });

  /**
   * With no forwarding header there is still a bucket -- one shared by every
   * unknown source. Skipping the check instead would make a strippable header
   * the limiter's off switch.
   */
  it("still limits when the request carries no source header", async () => {
    request.headers = new Map([["origin", "http://localhost:3000"]]);
    await withinAuthRateLimit("sign-in");
    expect(buckets().filter((b) => b.includes(":ip:"))).toHaveLength(1);
  });
});

describe("every auth endpoint refuses once limited", () => {
  beforeEach(() => {
    rpc.mockResolvedValue({ data: false, error: null });
  });

  it("sign-in returns the shared message and never asks GoTrue", async () => {
    const state = await signIn({}, form({ email: ADDRESS, password: "hunter2" }));
    expect(state.formError).toBe(LIMITED);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    // The typed address survives the refusal, per S1's React-19 form reset.
    expect(state.values?.email).toBe(ADDRESS);
  });

  it("sign-up returns the shared message and never asks GoTrue", async () => {
    const state = await signUp({}, form({ email: ADDRESS, password: "hunter2", consent: "on" }));
    expect(state.formError).toBe(LIMITED);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("magic link redirects with the shared message and sends no mail", async () => {
    await expect(sendMagicLink(form({ email: ADDRESS }))).rejects.toThrow(
      `NEXT_REDIRECT:/magic-link?error=${encodeURIComponent(LIMITED)}`,
    );
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("password reset redirects with the shared message and sends no mail", async () => {
    await expect(requestPasswordReset(form({ email: ADDRESS }))).rejects.toThrow(
      `NEXT_REDIRECT:/forgot-password?error=${encodeURIComponent(LIMITED)}`,
    );
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("email change redirects with the shared message and sends no mail", async () => {
    await expect(requestEmailChange(form({ email: "new@f4milia.test" }))).rejects.toThrow(
      `NEXT_REDIRECT:/account/email?error=${encodeURIComponent(LIMITED)}`,
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("password update returns the shared message and sets no password", async () => {
    const state = await updatePassword(
      {},
      form({ password: "hunter2hunter2", password_confirmation: "hunter2hunter2" }),
    );
    expect(state.formError).toBe(LIMITED);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  /**
   * One string across all six. A message that varied by endpoint, or named the
   * limit, or counted down, would tell a prober how to pace themselves -- and a
   * countdown on the address bucket would confirm the address exists.
   */
  it("says the same thing everywhere, and names neither the limit nor the address", async () => {
    expect(LIMITED).not.toMatch(/\d/);
    expect(LIMITED.toLowerCase()).not.toContain("account");
    expect(LIMITED.toLowerCase()).not.toContain("address");
  });
});

describe("ordering", () => {
  /**
   * The limiter sits after each action's own field checks. Someone who submits
   * an empty form has not made an attempt at anything, and burning their
   * allowance for a typo would lock people out of their own account for
   * fifteen minutes.
   */
  it("does not consume an allowance for a submission the action rejects itself", async () => {
    const state = await signIn({}, form({ email: "", password: "" }));
    expect(state.fieldErrors?.email).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("consumes before GoTrue, not after", async () => {
    const order: string[] = [];
    rpc.mockImplementation(() => {
      order.push("limiter");
      return Promise.resolve({ data: true, error: null });
    });
    auth.signInWithPassword.mockImplementation(() => {
      order.push("gotrue");
      return Promise.resolve({ data: {}, error: null });
    });
    await expect(signIn({}, form({ email: ADDRESS, password: "hunter2" }))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expect(order[order.length - 1]).toBe("gotrue");
    expect(order).toContain("limiter");
  });
});
