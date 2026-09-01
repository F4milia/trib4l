import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SENTRY_DATA_COLLECTION } from "../lib/observability/sentry";

// Invariant 12. The DSN comes from the environment so CI and staging never
// report into the production project, and every dataCollection option is set
// explicitly because the SDK's defaults are permissive.
//
// This guard exists because the failure it prevents is silent: a hardcoded DSN
// and an inherited default both look exactly like working configuration.

const CONFIGS = [
  "sentry.server.config.ts",
  "sentry.edge.config.ts",
  "instrumentation-client.ts",
] as const;

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

describe("Sentry configuration (invariant 12)", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe.each(CONFIGS)("%s", (file) => {
    it("hardcodes no DSN", () => {
      const source = read(file);
      // A Sentry DSN is a URL carrying a public key and a project id. Matching
      // the host is enough and does not depend on the key's shape.
      expect(source).not.toMatch(/ingest\.[a-z]+\.sentry\.io/);
      expect(source).not.toMatch(/dsn:\s*"/);
    });

    it("reads the DSN from the environment", () => {
      expect(read(file)).toMatch(/dsn:\s*(server|client)SentryDsn\(\)/);
    });

    it("uses the shared dataCollection object rather than its own copy", () => {
      // Three inline copies is how a fix reaches two files and misses the one
      // that leaks.
      expect(read(file)).toContain("dataCollection: SENTRY_DATA_COLLECTION");
    });

    it("does not send logs", () => {
      expect(read(file)).toContain("enableLogs: false");
    });
  });

  it("sets every permissive dataCollection option explicitly", async () => {
    // A closed set on purpose. Adding or removing a key has to be a decision
    // taken here, not a default inherited from an SDK upgrade.
    expect(SENTRY_DATA_COLLECTION).toEqual({
      userInfo: false,
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
      cookies: false,
      httpHeaders: { request: false, response: false },
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    });
  });

  it("disables the two options invariant 12 does not name but which carry Family content", () => {
    // databaseQueryData collects returned result data; stackFrameVariables
    // captures locals. Both default to true, and both sit in the path of an
    // ordinary error over a table of Family content.
    expect(SENTRY_DATA_COLLECTION.databaseQueryData).toBe(false);
    expect(SENTRY_DATA_COLLECTION.stackFrameVariables).toBe(false);
  });

  it("no-ops rather than throwing when the DSN is unset", async () => {
    vi.resetModules();
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const mod = await import("../lib/observability/sentry");
    expect(mod.serverSentryDsn()).toBeUndefined();
    expect(mod.clientSentryDsn()).toBeUndefined();
  });

  it("returns the DSN when the environment supplies one", async () => {
    vi.resetModules();
    process.env.SENTRY_DSN = "https://key@o1.ingest.us.sentry.io/2";
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://key@o1.ingest.us.sentry.io/3";
    const mod = await import("../lib/observability/sentry");
    expect(mod.serverSentryDsn()).toBe("https://key@o1.ingest.us.sentry.io/2");
    expect(mod.clientSentryDsn()).toBe("https://key@o1.ingest.us.sentry.io/3");
  });
});
