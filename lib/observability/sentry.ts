// Invariant 12: Sentry receives errors ONLY -- no Family content, no AI prompt
// or suggestion text, no auth cookie.
//
// The SDK's `dataCollection` defaults are permissive, so every option is set
// here explicitly rather than inherited. This object is shared by all three
// Sentry configs (server, edge, client) because the failure mode of three
// copies is that a fix reaches two of them, and the third is the one that
// leaks. tests/sentry-config.test.ts asserts all three import it.
//
// Read off @sentry/core's own `DataCollection` interface rather than from
// memory. Two of these are NOT named in invariant 12 and are the ones most
// likely to carry a Table entry or a message body:
//
//   databaseQueryData   default TRUE. Collects query parameters, inline
//                       literals in query text, and RETURNED RESULT DATA.
//                       A failing query over `table_entries` would ship the
//                       rows it returned.
//   stackFrameVariables default TRUE. Captures local variable values in stack
//                       frames -- a message body held in a local at the moment
//                       of a throw.
//
// Neither is a hypothetical: both are on by default and both sit directly in
// the path of ordinary application errors.
export const SENTRY_DATA_COLLECTION = {
  // Named by invariant 12.
  userInfo: false,
  httpBodies: [],
  genAI: { inputs: false, outputs: false },
  // "no auth cookie" -- cookies default to true, headers carry Authorization.
  cookies: false,
  httpHeaders: { request: false, response: false },
  // Family content by another route: ids and slugs in URLs, GraphQL documents,
  // query results, and locals.
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  databaseQueryData: false,
  stackFrameVariables: false,
};

// The DSN comes from the environment so CI and staging never report into the
// production project. Unset means Sentry no-ops, which is the correct default
// until a non-production project exists -- `Sentry.init({ dsn: undefined })`
// disables transport rather than throwing.
//
// Two variables, not one: the client config runs in the browser, so its DSN
// must be NEXT_PUBLIC_ to be inlined at build time. A DSN in a client bundle is
// normal and is not what invariant 12 guards; the invariant is that the project
// is chosen per environment rather than compiled in.
export function serverSentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || undefined;
}

export function clientSentryDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
}
