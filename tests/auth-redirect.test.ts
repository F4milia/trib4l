import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmUrl, siteOrigin } from "@/lib/auth/providers";

/**
 * Every emailed auth link must come back to the deployment that sent it.
 *
 * `{{ .SiteURL }}` is one fixed value per Supabase project, so a template that
 * hardcodes it sends every preview deployment's mail to production -- and,
 * locally, to whatever `site_url` says rather than to the server that produced
 * it. `{{ .RedirectTo }}` renders whatever the action passed, which is what
 * these assert the actions actually pass.
 */

const ORIGIN = "https://preview-abc123.vercel.app";

vi.mock("next/headers", () => ({
  headers: async () => new Map([["origin", ORIGIN]]),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getUser: vi.fn(),
}));
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

const { signUp, sendMagicLink, requestPasswordReset, requestEmailChange } = await import(
  "@/app/actions/auth"
);

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// The FULL route. Measured 2026-08-31: a bare origin fails Supabase's redirect
// allow-list (the `/**` wildcard does not match a pathless URL) and is silently
// replaced by SiteURL, so the path cannot live in the template.
const EXPECTED = `${ORIGIN}/auth/confirm`;

beforeEach(() => {
  auth.signUp.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.signInWithOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.getUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id: "u1", email: "old@f4milia.test" } }, error: null });
});

describe("every emailed flow returns to this deployment", () => {
  it("signUp", async () => {
    await expect(
      signUp({}, form({ email: "new@f4milia.test", password: "password123", consent: "on" })),
    ).rejects.toThrow();
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: EXPECTED }) }),
    );
  });

  it("magic link, without losing shouldCreateUser: false", async () => {
    await expect(sendMagicLink(form({ email: "a@f4milia.test" }))).rejects.toThrow();
    expect(auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ emailRedirectTo: EXPECTED, shouldCreateUser: false }),
      }),
    );
  });

  /** This one names the option `redirectTo`, not `emailRedirectTo`. */
  it("password reset", async () => {
    await expect(requestPasswordReset(form({ email: "a@f4milia.test" }))).rejects.toThrow();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "a@f4milia.test",
      expect.objectContaining({ redirectTo: EXPECTED }),
    );
  });

  it("email change", async () => {
    await expect(requestEmailChange(form({ email: "new@f4milia.test" }))).rejects.toThrow();
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: "new@f4milia.test" },
      expect.objectContaining({ emailRedirectTo: EXPECTED }),
    );
  });

  /**
   * The redirect is a return path, never a place to put identity. An address
   * in the URL would end up in server logs, referrers and the mail itself.
   */
  it("carries no address or token in the redirect", async () => {
    await expect(requestEmailChange(form({ email: "new@f4milia.test" }))).rejects.toThrow();
    const [, options] = auth.updateUser.mock.calls[0];
    expect(options.emailRedirectTo).toBe(EXPECTED);
    expect(options.emailRedirectTo).not.toContain("@");
    expect(options.emailRedirectTo).not.toContain("?");
  });
});

describe("confirmUrl / siteOrigin", () => {
  it("prefers explicit configuration over the request origin", () => {
    expect(confirmUrl("http://attacker.example", { NEXT_PUBLIC_SITE_URL: "https://f4milia.app" })).toBe(
      "https://f4milia.app/auth/confirm",
    );
  });

  it("falls back to the request origin, which is what makes previews work", () => {
    expect(confirmUrl(ORIGIN, {})).toBe(EXPECTED);
  });

  it("trims a trailing slash rather than producing a double slash", () => {
    expect(confirmUrl(null, { NEXT_PUBLIC_SITE_URL: "https://f4milia.app/" })).toBe(
      "https://f4milia.app/auth/confirm",
    );
  });

  it("refuses to build a URL from nothing, or from a non-http value", () => {
    expect(confirmUrl(null, {})).toBeNull();
    expect(confirmUrl("javascript:alert(1)", {})).toBeNull();
    expect(siteOrigin("f4milia.app", {})).toBeNull();
  });

  /**
   * The origin is client-controlled, and that is bounded rather than
   * dangerous: Supabase refuses any redirect outside site_url plus
   * additional_redirect_urls, so a forged origin fails the allow-list instead
   * of redirecting anyone. Asserted here so the reasoning is not lost.
   */
  it("carries the route but no query string, so the template's single ? stays theirs", () => {
    const url = confirmUrl(ORIGIN, {})!;
    expect(new URL(url).pathname).toBe("/auth/confirm");
    expect(url).not.toContain("?");
  });
});
