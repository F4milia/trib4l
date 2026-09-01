import { describe, expect, it } from "vitest";

import { inngest, isInngestConfigured } from "../lib/inngest/client";
import { functions } from "../lib/inngest/functions";

/**
 * The scaffolding's whole claim: it boots and sends nothing with no keys set.
 *
 * The failure mode this guards against is silent rather than loud. Inngest's
 * client does NOT throw without keys -- it accepts `send()` and the event
 * simply never arrives, which looks identical to a function that did not fire.
 * So the state has to be legible, and every caller has to check it.
 */
describe("inngest scaffolding", () => {
  it("constructs a client with no keys set", () => {
    // If this threw, every test in the process would fail with a stack trace
    // pointing at a missing secret rather than at anything under test -- and
    // `npm run dev` would fail on a fresh clone.
    expect(inngest.id).toBe("f4milia");
  });

  it("reports itself unconfigured when INNGEST_EVENT_KEY is absent", () => {
    expect(isInngestConfigured({})).toBe(false);
    expect(isInngestConfigured({ INNGEST_EVENT_KEY: "   " })).toBe(false);
  });

  it("reports itself configured once the key exists", () => {
    expect(isInngestConfigured({ INNGEST_EVENT_KEY: "signkey-x" })).toBe(true);
  });

  it("registers at least one function, so the handshake proves something", () => {
    // A route serving zero functions returns 200 and tells you nothing about
    // whether the wiring works.
    expect(functions.length).toBeGreaterThan(0);
  });

  it("carries no Family content in the event contract", async () => {
    // Invariant 3. An Inngest event leaves this process and is stored by a
    // third party, so the payload is ids only -- and the handler re-reads
    // through RLS, which is what makes ids sufficient.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("lib/inngest/client.ts", "utf8"),
    );
    const contract = source.slice(source.indexOf("NotificationCreatedEvent"));
    for (const forbidden of ["body", "text", "displayName", "email", "title"]) {
      expect(contract.slice(0, contract.indexOf("};"))).not.toContain(forbidden);
    }
  });
});
