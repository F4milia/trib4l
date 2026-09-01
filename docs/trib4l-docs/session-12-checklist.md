# Session 12 — Live Events and VOD Library

Tracks progress against the Session 12 scope in
[`trib4l-build-from-zero.md`](../trib4l-build-from-zero.md#phase-2--video-via-mux-sessions-11-12):
"Organizer-created live streams, RTMP ingest keys, auto-archive into VOD.
Library UI with stage and cohort entitlement filtering. Entitlement
resolution shares one code path with Session 11 — do not fork it."

## What "shares one code path" means here, concretely

Two separate things needed a stage gate for the first time this session,
and neither got its own parallel implementation:

- **`video_assets`** (Session 11) gained a `required_stage_id` column.
  `can_see_video_asset` was extended to call `is_at_or_past_stage`
  (Session 8's helper) directly — the same function every other
  stage-gated table already calls, not a re-derived comparison.
- **`live_streams`** (new this session) reuses `can_see_gated_content`
  (also Session 8) *unchanged* for its select policy — no
  moderation_state or uploader-self-visibility concept exists for
  staff-created content, so it needed neither of `can_see_video_asset`'s
  extra layers, just the same org/cohort/stage primitive posts already
  use.

An archived live stream becomes a plain `video_assets` row (see below),
so watching a past broadcast and watching a member-uploaded clip run
through the exact same entitlement check and the exact same player
component — not two parallel "video" concepts.

## Done and verified

- [x] **Every Mux Live Streaming API detail verified against the
  installed SDK's type definitions**, continuing Session 11's practice:
  `liveStreams.create`'s exact params, the `LiveStream` response shape
  (`stream_key`, `playback_ids`, `status`), and — the key discovery for
  linking an archived recording back to its stream —
  `WebhookAsset.live_stream_id`, confirmed present on asset webhook
  payloads rather than assumed. `video.asset.live_stream_completed` was
  chosen as the archival trigger over `video.asset.ready` specifically
  because the latter can fire mid-broadcast (so viewers can watch
  near-live); the former is Mux's actual "the recording is finalized"
  signal.
- [x] **`live_streams`**, single-use per broadcast (not re-armed for a
  second RTMP session — Mux itself supports that via
  `recent_asset_ids`, but nothing in this app's scope asks for it, and
  single-use keeps `video_asset_id` a plain nullable FK instead of a
  list). `stream_key` lives in its own table
  (`live_stream_credentials`), not a column on `live_streams` — RLS
  protects rows, not columns, and `live_streams` itself needs broad
  read access (any entitled member sees title/status/playback_id) that
  would have made the broadcasting credential readable by every viewer
  too if it shared the row.
- [x] **A real security gap reasoned through and closed before it
  shipped, more severe than Session 11's analogous one**: without a
  privileged-columns guard, an organizer could insert a live stream in
  their own org whose `playback_id` was copied from somewhere else
  entirely — RLS scopes *rows* by org, not the *truthfulness* of a
  row's own column values, so every eligible member of that org would
  receive a validly signed token for content that org never owned. Not
  a hypothetical: this is strictly worse than Session 11's
  member-uploaded-video version of the same bug shape, because there's
  no moderation_state layer softening it — staff already bypasses that
  entirely for their own org's content. Fixed the same way: Mux-verified
  columns (`mux_live_stream_id`, `playback_id`, `status`,
  `video_asset_id`) can only be set by the service-role path, never by
  the row's own creator, whether at insert or update.
- [x] **A second real gap found while building the first fix, not
  related to it**: the validating triggers on the new `live_streams`
  table query `stages`/`cohorts` to check org-matching — and
  `service_role` bypasses RLS but **not** ordinary Postgres `GRANT`
  privileges, a separate layer. Neither table had ever been granted to
  `service_role` (they predate Session 11, when `service_role` was
  introduced to this codebase at all), so the service-role webhook path
  updating a gated live stream failed outright with "permission denied
  for table stages" the first time an isolation test actually exercised
  that combination. Fixed with explicit grants; caught by an isolation
  test failing with the real Postgres error printed, not assumed safe.
- [x] **A third gap, caught by reasoning about consistency rather than
  a failing test**: `video_assets.required_stage_id` (added this
  session) had no org-matching validation trigger at all, unlike every
  other stage-gated column in this codebase (posts, and now
  `live_streams`). Added `check_video_asset_stage_matches_org`,
  matching the existing pattern rather than leaving the newest
  stage-gated column as the only unvalidated one.
- [x] **RLS + grants shipped together**, same discipline as every prior
  session. 6 new isolation tests (`tests/isolation/live-streams.test.ts`),
  taking the suite to 64 total: staff can create a live stream, a plain
  member cannot; a member cannot pre-declare a stream's Mux identity or
  status (only title/description are changeable after creation); the
  literal cross-org "done means" bar extended to live streams (a member
  in one org can't see or query another org's stream, including by its
  playback_id); a cohort-scoped stream is invisible outside the cohort
  and a stage-gated one is invisible below the gate (mirroring Session
  8's own test shape); `stream_key` is visible only to its creator and
  staff, and cannot be inserted by a plain authenticated session at all;
  and the literal "shares one code path" claim proven directly — the
  same stage that blocks a live stream also blocks its archived VOD
  once simulated through, using the exact same `is_at_or_past_stage`
  check on both.
- [x] **The escalation test genuinely fails loudly when loosened** —
  checked directly: temporarily replaced `live_streams_select` with
  `using (true)`, watched both the cross-org isolation test and the
  cohort/stage-gating test fail with the actual leaked rows printed,
  restored via `supabase db reset`, confirmed all 64 pass again.
- [x] **No hard duration cap on live/archived content** — a deliberate
  scope distinction from Session 11's member-upload caps: an hour-long
  organizer-run session is the normal case here, not the abuse case
  those caps exist for.
- [x] **UI**: a staff settings page (create a stream with optional
  cohort/stage gating, see the RTMP ingest URL and stream key for each
  of their streams), a member-facing library page (live streams and
  archived recordings the viewer is actually entitled to see, nothing
  further to filter — RLS already did it), and a single watch page that
  resolves to whichever is actually available (live playback if
  currently broadcasting, the archived recording once it isn't) rather
  than two separate pages. The player component itself
  (`components/video-player.tsx`) was promoted out of Session 11's
  video-specific route folder into a shared location and given a `live`
  prop, since both watch pages now use the literal same component.
  Manually verified end-to-end on a freshly reset database (yet again
  catching, and resetting past, leftover isolation-test state before
  concluding anything — this pattern is now unbroken across seven
  sessions running): the settings page renders correctly empty, a
  create attempt fails gracefully with the real Mux error message (see
  below) and leaves no orphaned Mux resource, and — since a real broadcast
  couldn't be exercised (see below) — the full active → idle → archived
  lifecycle and both watch-page branches were verified by writing the
  same row states a real webhook sequence would produce directly (the
  same technique Session 11 used to verify playback before a real
  webhook existed to test against), confirming the settings page, the
  library page, and the watch page's live/archived fallback all render
  correctly at each stage.

## A real product constraint discovered, not a bug

Attempting to create a real live stream against the account from Session
11 returned Mux's own error: **"Live streams are unavailable on the free
plan."** This is a genuine Mux plan limitation, not a bug in this app —
confirmed by calling `mux.video.liveStreams.create` directly and reading
the response. The app's own error handling was verified against exactly
this real failure: the create flow surfaces Mux's real message back to
the user through a clean redirect, crashes nothing, and leaves no
orphaned Mux resource (the placeholder `live_streams` row is left behind
inert — by design, the same "not worth an automated cleanup job for a
rare failure" reasoning as Session 11's equivalent case). Upgrading the
Mux plan is a billing decision only the user can make; until then, live
streaming specifically cannot be exercised end-to-end against the real
account, though the on-demand upload/playback path from Session 11 is
entirely unaffected (that's on a different Mux product with no such
plan gate).

## Pushed to hosted Supabase

All three new migrations pushed to `trib4l-staging` and
`trib4l-production`. CLI left linked to staging afterward, same safety
practice as prior sessions.

## Not done in Session 12 — explicitly out of scope or blocked

- **An actual real-encoder broadcast, confirmed via a real
  `video.live_stream.active` webhook arriving at the deployed route** —
  blocked on the Mux plan limitation above, not on anything this app
  does or doesn't do.
- **Reusing a single live stream across multiple broadcasts**
  (`recent_asset_ids`-style history) — single-use per broadcast, a
  deliberate scope decision, not a limitation of Mux's own API.
- **Manually ending/cancelling a live stream from the UI** — the
  lifecycle here is entirely webhook-driven (encoder connects → active;
  disconnects → idle → archived); nothing asked for a staff-initiated
  "end this stream" action, and Mux's own reconnect-window behavior
  already handles the "briefly disconnected" case correctly without one.
