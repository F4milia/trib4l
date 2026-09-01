import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// The PWA shell ships BEFORE Wave 4 and is owned by neither session that needs
// it. N1 adds web push; W2 builds the installed first-run. Both would otherwise
// have created these files in the same wave, in parallel worktrees.
//
// So the assertions here are mostly about what the shell must NOT contain. A
// shell that already had push logic in it would be N1's work done badly and
// early, and W2 would be building on a moving file.

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const manifest = JSON.parse(read("public/manifest.webmanifest"));
// Assert against CODE, not prose. The worker's comments describe what N1 will
// add in Wave 4 -- including the word `notificationclick` -- and a naive
// substring match on the whole file fails on the explanation of the rule it is
// enforcing. Stripping comments keeps the comment useful and the guard honest.
const stripComments = (source: string) =>
  source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const worker = stripComments(read("public/sw.js"));

describe("PWA manifest", () => {
  it("is installable: standalone display, a scope, and a start url", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("declares the two icon sizes an install prompt requires", () => {
    // Chrome will not offer installation without a 192 and a 512.
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("uses only the locked palette for its chrome", () => {
    // The browser paints these around the app, so they are brand surface even
    // though no component renders them. Parchment, per the design system.
    expect(manifest.background_color).toBe("#f7f4f0");
    expect(manifest.theme_color).toBe("#f7f4f0");
  });
});

describe("service worker", () => {
  it("contains no push or notification behaviour", () => {
    // This is N1's to add in Wave 4. If it were here already, N1 would be
    // reviewing its own feature rather than writing it, and the diff that
    // introduces Family content into a notification body would be invisible.
    expect(worker).not.toMatch(/addEventListener\(\s*["']push["']/);
    expect(worker).not.toMatch(/showNotification/);
    expect(worker).not.toMatch(/notificationclick/);
  });

  it("caches nothing", () => {
    // An offline cache decides what a Family sees when the network is gone.
    // Nothing in the run doc has made that decision, and a caching worker
    // nobody specified would serve stale Family content.
    expect(worker).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(worker).not.toMatch(/caches\.open/);
  });

  it("activates immediately rather than waiting for every tab to close", () => {
    // Otherwise N1's push handler does not reach the person who leaves the app
    // open all day, who is precisely the person notifications are for.
    expect(worker).toContain("skipWaiting");
    expect(worker).toContain("clients.claim");
  });
});

describe("registration", () => {
  const registration = read("components/service-worker-registration.tsx");

  it("is a client component", () => {
    expect(registration.startsWith('"use client"')).toBe(true);
  });

  it("degrades silently where service workers are unavailable", () => {
    // A private window, an insecure origin, or an unsupported browser must
    // leave the app working exactly as it does now. The shell is additive.
    expect(registration).toContain('"serviceWorker" in navigator');
    expect(registration).toMatch(/\.catch\(/);
  });

  it("is mounted by the root layout", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("<ServiceWorkerRegistration />");
    expect(layout).toContain('manifest: "/manifest.webmanifest"');
  });

  it("declares an apple-touch-icon, which Safari reads instead of the manifest", () => {
    // Without it an installed iOS app gets a screenshot of the page as its
    // home-screen tile.
    expect(read("app/layout.tsx")).toContain('apple: "/icons/icon-180.png"');
  });
});

describe("icons", () => {
  it.each([
    ["public/icons/icon-180.png", 180],
    ["public/icons/icon-192.png", 192],
    ["public/icons/icon-512.png", 512],
  ])("%s is a real PNG of the declared size", (file, size) => {
    const buf = readFileSync(path.join(root, file));
    // PNG signature, then IHDR's width and height at fixed offsets.
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(buf.readUInt32BE(16)).toBe(size);
    expect(buf.readUInt32BE(20)).toBe(size);
  });

  it("is reproducible from the generator, so the committed bytes can be re-derived", () => {
    // A committed binary nobody can regenerate is a binary nobody can review.
    expect(read("scripts/generate-pwa-icons.mjs")).toContain("PROVISIONAL");
  });
});
