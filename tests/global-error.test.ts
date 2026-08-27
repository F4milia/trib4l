import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(process.cwd(), "app/global-error.tsx"), "utf8");

describe("global-error", () => {
  it("imports the token layer -- it replaces the root layout and would otherwise be unstyled", () => {
    expect(src).toContain('import "./globals.css"');
  });

  it("paints the ground explicitly on both html and body", () => {
    expect(src).toMatch(/<html[\s\S]*?bg-parchment/);
    expect(src).toMatch(/<body[\s\S]*?bg-parchment/);
  });

  it("takes its strings from the copy deck, not inline", () => {
    expect(src).toContain("copy.globalError");
    expect(src).not.toMatch(/>\s*(Something|Reload|The page)/);
  });

  it("still reports the error to Sentry", () => {
    expect(src).toContain("Sentry.captureException(error)");
  });

  it("claims no status code -- the App Router exposes none here", () => {
    expect(src).not.toContain("statusCode");
    expect(src).not.toContain("next/error");
  });

  it("shows the digest only when there is one -- no invented placeholder", () => {
    expect(src).toMatch(/error\.digest \?/);
  });
});
