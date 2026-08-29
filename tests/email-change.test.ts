import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirected = vi.hoisted(() => ({ to: null as string | null }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected.to = to;
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const auth = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }));
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
    expect(auth.updateUser).toHaveBeenCalledWith({ email: "new@f4milia.test" });
    expect(redirected.to).toBe("/account/email?sent=1");
  });

  it("does not put the new address in the URL it redirects to", async () => {
    await expect(requestEmailChange(form("new@f4milia.test"))).rejects.toThrow();
    expect(redirected.to).not.toContain("new@");
    expect(redirected.to).not.toContain("%40");
  });
});
