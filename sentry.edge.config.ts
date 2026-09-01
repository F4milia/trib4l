// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { SENTRY_DATA_COLLECTION, serverSentryDsn } from "./lib/observability/sentry";

Sentry.init({
  dsn: serverSentryDsn(),

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Invariant 12 is errors ONLY. Logs carry arbitrary application
  // strings, which is the shape Family content takes.
  enableLogs: false,

  dataCollection: SENTRY_DATA_COLLECTION,
});
