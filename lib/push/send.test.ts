import { describe, expect, it } from "vitest";

import { buildPushPayload } from "./payload";
import { sendPush } from "./send";

const SUBSCRIPTION = {
  endpoint: "https://push.example/abc",
  p256dh: "key",
  auth: "auth",
};

describe("sendPush", () => {
  it("no-ops when the keys are unset, rather than throwing", async () => {
    // Unconfigured is a supported state, so a notification write must not fail
    // because nobody has generated a VAPID pair yet.
    const result = await sendPush(
      SUBSCRIPTION,
      buildPushPayload({ type: "mention", orgSlug: "fam", targetId: "1" }),
      { configured: false, reason: "web push is not configured: everything unset" },
    );
    expect(result).toEqual({
      sent: false,
      reason: "not-configured",
      detail: "web push is not configured: everything unset",
    });
  });

  it("returns a result rather than throwing on a real failure", async () => {
    // The endpoint is unroutable, so this exercises the catch path without a
    // network mock. Every realistic outcome here is expected -- a send that
    // threw would take down whatever wrote the notification.
    const result = await sendPush(
      SUBSCRIPTION,
      buildPushPayload({ type: "mention", orgSlug: "fam", targetId: "1" }),
      {
        configured: true,
        config: {
          publicKey: "BLg2Zk4tR6ZQhVJyLwLKYt2E5nQyD8YQBg1sZ5oQxJ8bWzHrO4h9Sd6cKX2fFm3nYt4pQ1rL8vT0uJ7wR3xN2Ac",
          privateKey: "aUuWQ0Y2hV9tR6ZQhVJyLwLKYt2E5nQyD8YQBg1sZ5o",
          subject: "mailto:ops@f4milia.test",
        },
      },
    );
    expect(result.sent).toBe(false);
    if (result.sent) return;
    expect(["failed", "expired"]).toContain(result.reason);
  }, 20_000);
});
