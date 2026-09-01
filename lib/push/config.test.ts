import { describe, expect, it } from "vitest";

import { readPushConfig } from "./config";

const COMPLETE = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPublicKey",
  VAPID_PRIVATE_KEY: "PrivateKey",
  VAPID_SUBJECT: "mailto:ops@f4milia.test",
};

describe("push configuration", () => {
  it("reports not-configured rather than throwing when nothing is set", () => {
    // The whole point. CI has no keys, local development has no keys, and
    // staging has none until James generates them -- so an import that threw
    // would fail every test in the process with a stack trace pointing at a
    // missing secret rather than at anything under test.
    const result = readPushConfig({});
    expect(result.configured).toBe(false);
  });

  it("names every variable that is missing, not just the first", () => {
    const result = readPushConfig({});
    expect(result.configured).toBe(false);
    if (result.configured) return;
    expect(result.reason).toContain("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    expect(result.reason).toContain("VAPID_PRIVATE_KEY");
    expect(result.reason).toContain("VAPID_SUBJECT");
  });

  it("treats whitespace as unset", () => {
    // A variable set to "" or " " in a dashboard is the most common way to
    // half-configure something, and it is indistinguishable from configured
    // unless trimmed.
    expect(readPushConfig({ ...COMPLETE, VAPID_PRIVATE_KEY: "   " }).configured).toBe(false);
  });

  it("rejects a subject that is not mailto: or https:", () => {
    // Push services reject a malformed subject per send, and the failure then
    // looks like a rejected subscription rather than a configuration error.
    const result = readPushConfig({ ...COMPLETE, VAPID_SUBJECT: "ops@f4milia.test" });
    expect(result.configured).toBe(false);
    if (result.configured) return;
    expect(result.reason).toContain("mailto:");
  });

  it("is configured when all three are present and well-formed", () => {
    const result = readPushConfig(COMPLETE);
    expect(result.configured).toBe(true);
    if (!result.configured) return;
    expect(result.config.subject).toBe("mailto:ops@f4milia.test");
  });
});
