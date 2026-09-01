// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { SENTRY_DATA_COLLECTION, clientSentryDsn } from "./lib/observability/sentry";

Sentry.init({
  dsn: clientSentryDsn(),

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Invariant 12 is errors ONLY. Logs carry arbitrary application
  // strings, which is the shape Family content takes.
  enableLogs: false,

  dataCollection: SENTRY_DATA_COLLECTION,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
