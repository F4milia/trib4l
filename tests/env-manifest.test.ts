import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Two guarantees, both about environment variables, both invisible when broken.
//
// 1. A key the code reads but `.env.example` never mentions is a key nobody
//    knows to set. It surfaces in staging as a feature that silently does
//    nothing.
// 2. INVARIANT 2. AI is server-side only, in Edge Functions. Model keys belong
//    in Supabase secrets and must never enter the Next.js environment at all --
//    a key the app process can read is a key a client component can import by
//    accident. This assertion fires one build step before A1's grep of the
//    bundle, and it fails on the *name*, so it catches the mistake at the point
//    someone writes it rather than after a build.

const root = process.cwd();
const example = readFileSync(path.join(root, ".env.example"), "utf8");

const declared = new Set(
  example
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0]),
);

// Supplied by the platform or the runtime, never by a person editing a file.
const PROVIDED_BY_THE_PLATFORM = new Set([
  "NODE_ENV",
  "CI",
  "VERCEL_URL",
  "NEXT_RUNTIME",
]);

// Public by design. Each is a value meant to reach the browser: an anon key
// bounded by RLS, a widget's site key, a publishable key, a DSN.
const INTENTIONALLY_PUBLIC = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
]);

// Never in this app's environment, in any form. Edge Function secrets only.
const EDGE_FUNCTION_ONLY = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"];

function referencedKeys(): string[] {
  const out = execSync(
    "grep -rhoE 'process\\.env\\.[A-Z0-9_]+' app lib middleware.ts *.ts *.mjs 2>/dev/null || true",
    { cwd: root, encoding: "utf8" },
  );
  return [...new Set(out.split("\n").filter(Boolean).map((m) => m.replace("process.env.", "")))];
}

describe("environment manifest", () => {
  it("declares every variable the application code reads", () => {
    const undeclared = referencedKeys().filter(
      (key) => !declared.has(key) && !PROVIDED_BY_THE_PLATFORM.has(key),
    );
    expect(undeclared).toEqual([]);
  });

  it("gives no private value a NEXT_PUBLIC_ prefix", () => {
    // NEXT_PUBLIC_ is compiled into the browser bundle. Anything secret-shaped
    // carrying it is a secret published to every visitor.
    const secretShaped = /(SECRET|_KEY|TOKEN|PASSWORD)$/;
    const leaked = [...declared].filter(
      (key) =>
        key.startsWith("NEXT_PUBLIC_") &&
        secretShaped.test(key) &&
        !INTENTIONALLY_PUBLIC.has(key),
    );
    expect(leaked).toEqual([]);
  });

  it("keeps the AI model keys out of the app environment entirely", () => {
    // Invariant 2. These live in Supabase Edge Function secrets. Their presence
    // here -- or in any bundled source -- means a model call has been wired
    // into Next.js rather than into an Edge Function.
    for (const key of EDGE_FUNCTION_ONLY) {
      expect(declared.has(key)).toBe(false);
      expect(referencedKeys()).not.toContain(key);
    }
  });

  it("documents where the model keys do belong, so the omission reads as deliberate", () => {
    // An absent variable and a forgotten variable look identical. The comment
    // is what makes this one legible to the next session.
    expect(example).toMatch(/SUPABASE EDGE FUNCTION SECRETS/);
    expect(example).toMatch(/ANTHROPIC_API_KEY and OPENAI_API_KEY/);
  });
});
