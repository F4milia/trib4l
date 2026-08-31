import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Turnstile's plumbing (S2, PR 3). Captcha is still DISABLED in
 * supabase/config.toml at this PR -- PR 4 flips it -- so what is asserted here
 * is that a token is obtained and forwarded, not that anything is enforced.
 *
 * Measured 2026-09-01 against the local GoTrue, and the reason this PR is safe
 * to merge before the flip: with captcha off, POST /auth/v1/token carrying
 * `gotrue_meta_security.captcha_token` returns 200. GoTrue ignores a token it
 * was not asked to verify, so the plumbing is inert until the flip.
 */

// next/script does nothing useful in jsdom, so it is stubbed. A div carrying the
// url rather than a real <script src>: @next/next/no-sync-scripts fails the lint
// on the latter, and the assertion only needs to see which url was requested.
vi.mock("next/script", () => ({
  default: ({ src }: { src: string }) => <div data-testid="turnstile-script" data-src={src} />,
}));

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: async () => ({ data: true, error: null }) }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["origin", "http://localhost:3000"]]),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const { Turnstile } = await import("@/components/turnstile");
const { TURNSTILE_FIELD, captchaToken, captchaConfigured } = await import("@/lib/auth/captcha");
const { signUp, signIn, sendMagicLink, requestPasswordReset } = await import(
  "@/app/actions/auth"
);

const SITE_KEY = "0x4AAAAAAABBBBCCCCDDDDEE";
const TOKEN = "turnstile-token-from-the-widget";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = SITE_KEY;
  auth.signUp.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.signInWithOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
});

describe("the widget", () => {
  /**
   * The same rule as components/oauth-buttons.tsx: offer nothing rather than
   * something broken. Local development and CI have no site key, and a widget
   * pointed at an absent one is a form that cannot be submitted.
   */
  it("renders nothing at all without a site key", () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const { container } = render(<Turnstile action="signup" />);
    expect(container.innerHTML).toBe("");
    expect(captchaConfigured()).toBe(false);
  });

  it("renders the widget and the script when a site key is present", () => {
    const { container } = render(<Turnstile action="signup" />);
    const widget = container.querySelector(".cf-turnstile");
    expect(widget).not.toBeNull();
    expect(widget!.getAttribute("data-sitekey")).toBe(SITE_KEY);
    expect(
      container.querySelector('[data-testid="turnstile-script"]')!.getAttribute("data-src"),
    ).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js");
  });

  /**
   * The design-constraint decision, asserted so it cannot drift. Cloudflare's
   * widget is an iframe we cannot restyle, so the only way to honour
   * zero-border-radius is for it not to draw unless a challenge is genuinely
   * required. `appearance="always"` would put third-party chrome on the first
   * screen anyone sees.
   */
  it("draws nothing unless an interactive challenge is required", () => {
    const { container } = render(<Turnstile action="signin" />);
    expect(container.querySelector(".cf-turnstile")!.getAttribute("data-appearance")).toBe(
      "interaction-only",
    );
  });

  it("labels each surface so Cloudflare can tell them apart", () => {
    const { container } = render(<Turnstile action="magic-link" />);
    expect(container.querySelector(".cf-turnstile")!.getAttribute("data-action")).toBe(
      "magic-link",
    );
  });
});

describe("reading the token", () => {
  it("uses the field name Turnstile actually writes", () => {
    // Turnstile's implicit render inserts a hidden input with this exact name.
    // Getting it wrong produces a silently tokenless form.
    expect(TURNSTILE_FIELD).toBe("cf-turnstile-response");
  });

  it("returns undefined rather than an empty string when there is no token", () => {
    // An empty string would send GoTrue a token to reject, producing "your
    // captcha was wrong" for a widget that never loaded.
    expect(captchaToken(form({}))).toBeUndefined();
    expect(captchaToken(form({ [TURNSTILE_FIELD]: "   " }))).toBeUndefined();
    expect(captchaToken(form({ [TURNSTILE_FIELD]: TOKEN }))).toBe(TOKEN);
  });
});

describe("forwarding the token to GoTrue", () => {
  it("signup forwards it", async () => {
    await expect(
      signUp({}, form({ email: "a@f4milia.test", password: "hunter2", consent: "on", [TURNSTILE_FIELD]: TOKEN })),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ captchaToken: TOKEN }) }),
    );
  });

  it("password sign-in forwards it", async () => {
    await expect(
      signIn({}, form({ email: "a@f4milia.test", password: "hunter2", [TURNSTILE_FIELD]: TOKEN })),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(auth.signInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ options: { captchaToken: TOKEN } }),
    );
  });

  it("magic link forwards it, without losing shouldCreateUser: false", async () => {
    await expect(
      sendMagicLink(form({ email: "a@f4milia.test", [TURNSTILE_FIELD]: TOKEN })),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ captchaToken: TOKEN, shouldCreateUser: false }),
      }),
    );
  });

  it("password reset forwards it, without losing the return url", async () => {
    await expect(
      requestPasswordReset(form({ email: "a@f4milia.test", [TURNSTILE_FIELD]: TOKEN })),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "a@f4milia.test",
      expect.objectContaining({
        captchaToken: TOKEN,
        redirectTo: "http://localhost:3000/auth/confirm",
      }),
    );
  });

  /**
   * Absence must not become an empty token. Every one of these four is reachable
   * with no widget on the page (no site key configured), and with captcha off
   * that has to keep working.
   */
  it("omits the option entirely when the form carries no token", async () => {
    await expect(
      signIn({}, form({ email: "a@f4milia.test", password: "hunter2" })),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(auth.signInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ options: { captchaToken: undefined } }),
    );
  });
});

describe("[auth.captcha] in supabase/config.toml", () => {
  const config = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");
  const section = config.split(/^\[/m).find((s) => s.startsWith("auth.captcha]")) ?? "";

  /**
   * PR 3 asserted this block was DISABLED, because that PR was deliberately
   * inert. PR 4 flips it, so the assertion is replaced by the stronger claim
   * rather than deleted -- the weak version would now pass on a config that
   * enforces nothing.
   *
   * Enforcement itself is asserted against a running GoTrue in
   * tests/isolation/captcha.test.ts. A config file agreeing with itself proves
   * nothing; this block only guards the shape of the file.
   */
  it("is enabled, and points at turnstile", () => {
    expect(/^\s*enabled\s*=\s*true\s*$/m.test(section)).toBe(true);
    expect(/^\s*provider\s*=\s*"turnstile"\s*$/m.test(section)).toBe(true);
  });

  /**
   * The secret must come from the environment, never as a literal. `supabase
   * config push` sends this file to whatever project is linked, so a literal
   * test secret here could reach a hosted project and turn its captcha into a
   * rubber stamp that still reads as "enabled" -- the S1 hosted-config lesson,
   * in a form that fails silently instead of loudly.
   */
  it("reads its secret from the environment, with no literal in the file", () => {
    const secret = section.match(/^\s*secret\s*=\s*"([^"]*)"/m)?.[1] ?? "";
    expect(secret).toMatch(/^env\(\w+\)$/);
  });
});
