import Mux from "@mux/mux-node";

// Reads MUX_TOKEN_ID/MUX_TOKEN_SECRET/MUX_WEBHOOK_SECRET/MUX_SIGNING_KEY/
// MUX_PRIVATE_KEY straight from process.env -- these are the SDK's own
// default env var names (verified against @mux/mux-node's client.d.ts),
// not names this codebase invented, so .env.example matches them exactly.
//
// Constructed lazily, not as a module-level singleton: the Mux
// constructor throws immediately if no credentials are configured at
// all, and until a real Mux account exists (this session's schema/RLS
// is fully verified without one; the live API calls are not -- see the
// Session 11 checklist), that would crash every import of this module,
// which would crash the whole app, not just the video feature.
let cachedClient: Mux | undefined;

export function getMux(): Mux {
  cachedClient ??= new Mux();
  return cachedClient;
}

// Hard caps the plan calls for ("Member video in posts with hard caps on
// duration and file size"). File size has no server-side enforcement
// point in Mux's Direct Upload API as of writing -- there's no
// max-file-size parameter on upload creation -- so it's enforced
// client-side only (a real, disclosed limitation, not a silent gap; see
// the Session 11 checklist). Duration is enforced after the fact, in the
// webhook handler, once Mux reports the real value.
export const MAX_VIDEO_DURATION_SECONDS = 600; // 10 minutes
export const MAX_VIDEO_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB, client-side check only

// Live streams (Session 12) are organizer-run events, not short
// member-uploaded clips -- neither hard cap above applies to them; an
// hour-long support-group session is exactly the normal case, not an
// abuse case.
export const RTMP_INGEST_URL = "rtmp://global-live.mux.com:5222/app";
export const LIVE_STREAM_RECONNECT_WINDOW_SECONDS = 60;
