"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that Wave 4 extends.
 *
 * Renders nothing and blocks nothing. Registration is deliberately fire and
 * forget: a browser without service worker support, a private window that
 * refuses one, or an insecure origin must all leave the app working exactly as
 * it does now. The PWA shell is additive -- nothing in the product depends on
 * it yet, and nothing should start depending on it silently.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Errors are swallowed on purpose. A failed registration is not a failed
    // page, and reporting it would put a browser-support message in front of
    // someone who came here to read a Table entry.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
