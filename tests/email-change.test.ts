import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const auth = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }));
/**
 * S2 put a rate limiter in front of every auth action, so these tests now need
 * a store for it to consult. It says yes: this file is about what the action
 * does with a request the limiter ALLOWED, and the limiter's own behaviour --
 * including what every endpoint does once it says no -- is asserted in
 * tests/auth-rate-limits.test.ts. Mocking the store rather than the limiter
 * keeps the real lib/auth/rate-limit.ts in the path here, so a limiter that
 * started refusing everything would still surface in this file.
 */
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: async () => ({ data: true, error: null }) }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));

const { requestEmailChange } = await import("@/app/actions/auth");

function form(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

const signedIn = { data: { user: { id: "u1", email: "alice@f4milia.test" } }, error: null };

beforeEach(() => {
  redirected.to = null;
  auth.getUser.mockReset().mockResolvedValue(signedIn);
  auth.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
});

/* -------------------------------------------------------------------------- */
/* The re-verification itself is configuration, so it is asserted as such      */
/* -------------------------------------------------------------------------- */

describe("re-verification on change of address", () => {
  const config = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");

  /**
   * This one line IS the "re-verification on email change" the prompt asks
   * for. With it, GoTrue emails both the current address and the new one and
   * the change lands only when BOTH confirm. Without it only the new address
   * is asked -- which would let anyone with a walk-up session on an unlocked
   * laptop move the account to an address they control, with the real owner
   * never told.
   */
  it("asks the old address as well as the new one", () => {
    const block = config.slice(config.indexOf("[auth.email]"), config.indexOf("[auth.sms]"));
    expect(block).toMatch(/^\s*double_confirm_changes\s*=\s*true\s*$/m);
  });
});

describe("requestEmailChange", () => {
  it("refuses a signed-out caller, and writes nothing", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requestEmailChange(form("new@f4milia.test"))).rejects.toThrow();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(redirected.to).toBe("/login");
  });

  it("checks the session before it looks at the field", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requestEmailChange(form(""))).rejects.toThrow();
    expect(redirected.to).toBe("/login");
  });

  it("refuses an empty address, and writes nothing", async () => {
    await expect(requestEmailChange(form("   "))).rejects.toThrow();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(redirected.to).toMatch(/^\/account\/email\?error=/);
  });

  /**
   * Submitting the address the account already has would otherwise send two
   * confirmation emails to the same inbox for a change that is not one.
   */
  it("refuses the address the account already has", async () => {
    await expect(requestEmailChange(form("alice@f4milia.test"))).rejects.toThrow();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("compares the current address case-insensitively", async () => {
    await expect(requestEmailChange(form("Alice@F4milia.test"))).rejects.toThrow();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  /**
   * The current address comes from the session, never from the form -- so
   * there is nothing a client can supply to make the action act on another
   * account.
   */
  it("takes the account from the session and passes only the new address", async () => {
    await expect(requestEmailChange(form("new@f4milia.test"))).rejects.toThrow();
    expect(auth.updateUser).toHaveBeenCalledTimes(1);

    // Asserted on the payload and the options separately, rather than on the
    // whole call. updateUser gained a second argument when emailed links
    // started carrying a per-deployment return URL; the claim this test makes
    // is about the PAYLOAD -- that it contains the new address and nothing
    // else -- and checking the arguments as one blob would have quietly
    // stopped making it.
    const [payload, options] = auth.updateUser.mock.calls[0];
    expect(payload).toEqual({ email: "new@f4milia.test" });
    expect(Object.keys(options)).toEqual(["emailRedirectTo"]);

    expect(redirected.to).toBe("/account/email?sent=1");
  });

  it("does not put the new address in the URL it redirects to", async () => {
    await expect(requestEmailChange(form("new@f4milia.test"))).rejects.toThrow();
    expect(redirected.to).not.toContain("new@");
    expect(redirected.to).not.toContain("%40");
  });
});
