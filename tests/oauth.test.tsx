import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAUTH_PROVIDERS, callbackUrl, configuredProviders, oauthProvider } from "@/lib/auth/providers";

const config = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");

/* -------------------------------------------------------------------------- */
/* The config rule that would take CI down                                    */
/* -------------------------------------------------------------------------- */

describe("[auth.external.*] blocks", () => {
  const blocks = config
    .split(/^\[/m)
    .map((section) => `[${section}`)
    .filter((section) => /^\[auth\.external\.\w+\]/.test(section))
    .map((section) => ({
      name: section.match(/^\[auth\.external\.(\w+)\]/)![1],
      enabled: /^\s*enabled\s*=\s*true\s*$/m.test(section),
      clientId: section.match(/^\s*client_id\s*=\s*"([^"]*)"/m)?.[1] ?? "",
    }));

  it("found the provider blocks to guard", () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  /**
   * Measured on 2026-08-30, not assumed: `enabled = true` with an empty
   * client_id makes the Supabase CLI refuse to parse this file at all --
   * `supabase start` AND `supabase status` fail with ProjectConfigParseError.
   * That is not a provider that quietly does not work; it is every developer's
   * local stack and all three CI jobs (migrations, pgtap, isolation), each of
   * which begins with `npx supabase start`.
   *
   * `client_id = "env(...)"` resolves to the empty string when the variable is
   * unset, so committing an enabled provider ahead of its credentials is
   * exactly the shape that breaks. Enable a provider in the same change that
   * gives it a client id.
   */
  it.each(blocks)("$name is not enabled without a client id", ({ enabled, clientId }) => {
    if (!enabled) return;
    expect(clientId.trim()).not.toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* The provider registry                                                      */
/* -------------------------------------------------------------------------- */

describe("oauthProvider", () => {
  it.each(OAUTH_PROVIDERS.map((p) => p.id))("accepts %s", (id) => {
    expect(oauthProvider(id)).toBe(id);
  });

  it.each(["github", "facebook", "", "GOOGLE", "google ", "../../etc"])("rejects %s", (raw) => {
    expect(oauthProvider(raw)).toBeNull();
  });

  it("rejects a missing value", () => {
    expect(oauthProvider(null)).toBeNull();
    expect(oauthProvider(undefined)).toBeNull();
  });
});

describe("configuredProviders", () => {
  it("offers nothing when the project has configured nothing", () => {
    expect(configuredProviders({})).toEqual([]);
  });

  it("treats an empty or whitespace client id as unconfigured", () => {
    expect(configuredProviders({ SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "" })).toEqual([]);
    expect(configuredProviders({ SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "   " })).toEqual([]);
  });

  it("offers only the providers that are configured", () => {
    expect(configuredProviders({ SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "abc.apps.googleusercontent.com" })).toEqual([
      "google",
    ]);
  });

  it("offers both when both are configured, in registry order", () => {
    expect(
      configuredProviders({
        SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID: "com.f4milia.app",
        SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "abc.apps.googleusercontent.com",
      }),
    ).toEqual(["google", "apple"]);
  });
});

describe("callbackUrl", () => {
  it("prefers explicit configuration over the request origin", () => {
    expect(callbackUrl("http://attacker.example", { NEXT_PUBLIC_SITE_URL: "https://f4milia.app" })).toBe(
      "https://f4milia.app/auth/callback",
    );
  });

  it("falls back to the request origin when nothing is configured", () => {
    expect(callbackUrl("http://localhost:3000", {})).toBe("http://localhost:3000/auth/callback");
  });

  it("trims a trailing slash rather than producing a double slash", () => {
    expect(callbackUrl(null, { NEXT_PUBLIC_SITE_URL: "https://f4milia.app/" })).toBe(
      "https://f4milia.app/auth/callback",
    );
  });

  it("refuses to build a URL from nothing, or from a non-http value", () => {
    expect(callbackUrl(null, {})).toBeNull();
    expect(callbackUrl("javascript:alert(1)", {})).toBeNull();
    expect(callbackUrl(null, { NEXT_PUBLIC_SITE_URL: "f4milia.app" })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* What the screens render                                                    */
/* -------------------------------------------------------------------------- */

describe("OAuthButtons", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID;
    delete process.env.SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...original };
  });

  async function renderButtons() {
    const { OAuthButtons } = await import("@/components/oauth-buttons");
    return render(<OAuthButtons />);
  }

  /**
   * The honest-empty-state rule. A provider button that is not configured
   * sends people to an error, and an "or" rule above nothing is exactly the
   * invented placeholder CLAUDE.md rules out.
   */
  it("renders nothing at all -- not even the divider -- when no provider is configured", async () => {
    const { container } = await renderButtons();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the configured provider", async () => {
    process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID = "abc.apps.googleusercontent.com";
    await renderButtons();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue with apple/i })).toBeNull();
  });

  /**
   * §2.1: terracotta marks the one thing that is live on a screen. On a
   * sign-in screen that is the sign-in button -- three filled buttons would be
   * three primary actions.
   */
  it("does not compete with the primary action for terracotta", async () => {
    process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID = "abc.apps.googleusercontent.com";
    await renderButtons();
    expect(screen.getByRole("button", { name: /continue with google/i }).className).not.toContain(
      "bg-terracotta",
    );
  });

  it("submits the provider as a form field, so it can be narrowed server-side", async () => {
    process.env.SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID = "com.f4milia.app";
    const { container } = await renderButtons();
    const field = container.querySelector('input[name="provider"]') as HTMLInputElement;
    expect(field.value).toBe("apple");
    expect(field.type).toBe("hidden");
  });
});
