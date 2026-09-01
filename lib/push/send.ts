import webpush from "web-push";

import { readPushConfig, type PushConfigResult } from "./config";
import type { PushPayload } from "./payload";

/**
 * Sends one push. Server-only.
 *
 * Returns a result rather than throwing, because every realistic outcome here
 * is expected: the keys are unset (local, CI, staging before setup), the
 * subscription is gone (the member cleared site data), or the push service is
 * briefly unavailable. A send that throws would make a notification failure
 * take down whatever wrote the notification.
 */

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "not-configured"; detail: string }
  | { sent: false; reason: "expired" }
  | { sent: false; reason: "failed"; detail: string };

export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload,
  configResult: PushConfigResult = readPushConfig(),
): Promise<SendResult> {
  if (!configResult.configured) {
    // Not an error. Unconfigured is a no-op, so the app boots and the suite
    // passes with none of these keys set.
    return { sent: false, reason: "not-configured", detail: configResult.reason };
  }

  const { publicKey, privateKey, subject } = configResult.config;
  webpush.setVapidDetails(subject, publicKey, privateKey);

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    return { sent: true };
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    // 404/410 mean the subscription is permanently gone. N1 sets expired_at
    // rather than deleting, so a member who re-authorises is not treated as
    // brand new.
    if (statusCode === 404 || statusCode === 410) {
      return { sent: false, reason: "expired" };
    }
    return {
      sent: false,
      reason: "failed",
      detail: statusCode ? `push service returned ${statusCode}` : "push service unreachable",
    };
  }
}
