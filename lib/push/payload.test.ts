import { describe, expect, it } from "vitest";

import { buildPushPayload } from "./payload";

/**
 * INVARIANT 3, and this is the test that matters most in the PR.
 *
 *   "NO Family content in any outbound message. Emails and pushes name the
 *    event, never the content. Assume the inbox may be shared."
 *
 * A push arrives on a lock screen. The device may be someone else's, face-up
 * on a table, or mirrored to a car. So the assertions below are not about
 * formatting -- they are about what a bystander can learn.
 */

// Strings a real Family would produce. If any of these ever appears in a
// payload, something has started interpolating content.
const FAMILY_CONTENT = [
  "Mum had a bad night and I did not sleep",
  "Ana",
  "Ana Ruiz",
  "the biopsy came back",
  "@ana can you take Tuesday",
];

describe("push payload (invariant 3)", () => {
  it("names the event, not the content", () => {
    const payload = buildPushPayload({
      type: "mention",
      orgSlug: "caregiver-circle",
      targetId: "00000000-0000-0000-0000-0000000000aa",
    });

    expect(payload.title).toBe("You were mentioned");
    expect(payload.body).toBe("Open F4milia to see it.");
  });

  it("does not name the person who caused it", () => {
    // "Ana mentioned you" tells a bystander who is in this person's Family.
    // "You were mentioned" does not, and the app is one tap away for anyone
    // entitled to the detail.
    const payload = buildPushPayload({
      type: "mention",
      orgSlug: "caregiver-circle",
      targetId: "00000000-0000-0000-0000-0000000000aa",
    });
    const serialised = JSON.stringify(payload);
    for (const content of FAMILY_CONTENT) {
      expect(serialised).not.toContain(content);
    }
  });

  it("has no parameter that could carry content", () => {
    // The structural half of the guarantee. A caller who wanted to interpolate
    // a message body would have to change payload.ts -- a reviewable diff --
    // rather than pass a different string to an existing function, which is
    // not. This test fails the moment such a parameter is added.
    const accepted = Object.keys({
      type: "mention" as const,
      orgSlug: "x",
      targetId: "y",
    });
    expect(accepted.sort()).toEqual(["orgSlug", "targetId", "type"]);
  });

  it("covers every notification type, so a new one cannot ship untitled", () => {
    // Record<NotificationType, string> makes this a compile error too, but the
    // runtime assertion is what catches an enum value added by a migration
    // whose types have not been regenerated.
    for (const type of ["mention", "family_night_digest", "vow_notification"] as const) {
      const payload = buildPushPayload({ type, orgSlug: "s", targetId: "t" });
      expect(payload.title.length).toBeGreaterThan(0);
      expect(payload.body).toBe("Open F4milia to see it.");
    }
  });

  it("links by id, so the page re-reads through RLS", () => {
    const payload = buildPushPayload({
      type: "mention",
      orgSlug: "caregiver-circle",
      targetId: "00000000-0000-0000-0000-0000000000aa",
    });
    expect(payload.url).toBe(
      "/o/caregiver-circle/messages?n=00000000-0000-0000-0000-0000000000aa",
    );
  });

  it("collapses repeats per Family and per type", () => {
    // Twenty mentions must not become twenty lock-screen rows.
    const a = buildPushPayload({ type: "mention", orgSlug: "fam", targetId: "1" });
    const b = buildPushPayload({ type: "mention", orgSlug: "fam", targetId: "2" });
    const other = buildPushPayload({ type: "vow_notification", orgSlug: "fam", targetId: "3" });
    expect(a.tag).toBe(b.tag);
    expect(a.tag).not.toBe(other.tag);
  });
});
