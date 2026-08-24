# Session 11 — Video Foundation and Member Uploads

Tracks progress against the Session 11 scope in
[`trib4l-build-from-zero.md`](./trib4l-build-from-zero.md#phase-2--video-via-mux-sessions-11-12):
"`video_assets` (org_id, uploader, mux_asset_id, playback_id, policy,
status, duration, moderation_state). Signed direct uploads, Mux webhooks
through the idempotent handler, signed playback JWTs behind a membership
check. Rate limiting on the upload endpoint... Member video in posts with
hard caps on duration and file size, and a retention policy set here, not
after the first invoice." *Done means:* "a member in Org A cannot play an
Org B asset while holding the playback ID, and a test proves it."

This is the first session with a genuine third-party dependency (Mux).
Schema/RLS/authorization — what the "done means" bar is actually about —
was built and fully verified locally first, before any Mux account
existed. The user then created a Mux account and provided real
credentials within the same session, which let the live integration
itself get verified end-to-end too (see "Verified live against the real
Mux account" below) — not just built and typechecked against the SDK's
types.

## A decision made explicitly before building

The plan calls out member video moderation as unresolved ("pre-approval or
post-report? Changes Session 11's UX and your exposure"). Asked directly:
**post-report**, matching how every other content type in this app
already works — a video is playable the moment it's ready; organizers
remove it after the fact via `moderate_video_asset`, the same shape as
Session 6's `moderate_post`.

## Done and verified

- [x] **The actual Mux API contract was verified against real SDK type
  definitions before writing any code**, not from memory: `POST
  /video/v1/uploads`'s exact request/response shape, the `Mux-Signature`
  header's `t=...,v1=...` format and HMAC-SHA256 verification, every
  video-related webhook event type and the `WebhookAsset` payload shape
  (`id`, `status`, `duration`, `passthrough`, `playback_ids`,
  `upload_id`), and `client.jwt.signPlaybackId`'s signature — all read
  directly from `@mux/mux-node`'s installed `.d.ts` files after
  installing the package, cross-checked against Mux's own docs.
- [x] **`video_assets`** — `org_id`, `cohort_id` (nullable, same
  org-wide-or-cohort-scoped shape as posts/meetups), `uploader_profile_id`,
  `mux_upload_id`/`mux_asset_id`/`playback_id`, `policy` and `status`
  as `CHECK`-constrained small fixed sets (not free text like meetups'
  `meeting_provider` — these mirror a genuinely fixed set of values Mux's
  own API defines, not something this app expects to extend), and
  `moderation_state` (distinct from `status`: the human decision, not the
  technical processing state).
- [x] **A real, pre-launch design bug an isolation test caught, not a
  test-writing mistake this time**: the first version of
  `can_see_video_asset` only bypassed for staff, meaning an uploader
  could not see their own not-yet-approved video at all — which would
  have made the "My videos" page unable to show upload/processing status
  for anything not yet approved. Fixed by adding `uploader_profile_id =
  auth.uid()` as its own bypass condition, so an uploader always sees
  their own row regardless of moderation state, while an outsider still
  can't.
- [x] **A second real gap closed before it shipped**: the initial insert
  policy let an authenticated member insert their own `video_assets` row
  with `status = 'ready'`, `moderation_state = 'approved'`, and any
  `playback_id` they chose — completely skipping Mux and moderation.
  Closed by extending the same privileged-columns guard trigger to also
  fire on INSERT (not just UPDATE, where the equivalent gap for staff
  updates was designed in from the start, following Session 9's
  `mentor_pairings` precedent): non-service-role callers may only insert
  the column defaults for `status`/`moderation_state`/`mux_asset_id`/
  `playback_id`/`duration_seconds`; every column is open to the
  service-role webhook path, which is the one path meant to set them.
  Verified the service-role/authenticated distinction using
  `auth.jwt() ->> 'role'` (the non-deprecated replacement for
  `auth.role()`), the same `request.jwt.claims` mechanism `auth.uid()`
  already relies on everywhere.
- [x] **A `service_role` Supabase client** (`lib/supabase/service.ts`) —
  the first this codebase has needed; every prior session's writes went
  through either a user's own RLS-scoped session or a `SECURITY DEFINER`
  function. The Mux webhook route is an anonymous request with no user
  session at all, so it's the one legitimate caller.
- [x] **RLS + grants shipped together**, same discipline as every prior
  session. 7 isolation tests (`tests/isolation/video-assets.test.ts`),
  taking the suite to 58 total, all run using a service-role test client
  (`createServiceRoleClient` in `tests/isolation/helpers.ts`, the local
  stack's well-known service-role key, same convention as the existing
  well-known anon key) to simulate exactly what the real webhook handler
  would have written — no test in this file, or anywhere else, calls the
  real Mux API. Covers: a member can start an upload into their own org
  but cannot pre-declare it ready; a member cannot upload as someone else
  or into an org they don't belong to; once ready, only staff (never the
  uploader) can update it, and only `moderation_state`; a pending video
  is visible to its uploader and staff but not an outsider; a video
  attached to a post must match the post's org/cohort and author, and a
  video can't be attached to two posts; an over-cap video is
  auto-rejected exactly the way the webhook handler would do it; **and
  the literal "done means" bar** — a member in one org cannot see or
  query by another org's video, including by its playback_id directly.
- [x] **The escalation test genuinely fails loudly when loosened** —
  checked directly: temporarily replaced `video_assets_select` with
  `using (true)`, watched both the cross-org "done means" test and the
  pending-video-visibility test fail with the actual leaked row data
  printed, restored via `supabase db reset`, confirmed all 58 pass again.
- [x] **Hard caps.** Duration (10 minutes) is enforced in the webhook
  handler once Mux reports the real value: an over-cap video is
  auto-rejected and its Mux asset deleted immediately to reclaim storage.
  File size (500 MB) is enforced client-side only — Mux's Direct Upload
  API has no server-side max-file-size parameter as of writing, confirmed
  against the SDK/docs rather than assumed, so this is a disclosed,
  real limitation, not a silent gap.
- [x] **Rate limiting on the upload endpoint** — a plain count query (max
  5 uploads per uploader per rolling hour) checked before ever calling
  Mux's API, so a rejected request doesn't cost anything.
- [x] **Retention policy extended** in `docs/data-retention-policy.md`
  with a new category: a rejected video's Mux asset is deleted
  immediately (both the auto-rejection and the staff-moderation path now
  do this); an orphaned ready-but-never-attached video becomes eligible
  for cleanup after 30 days — decided and documented now, not
  automated yet, matching Session 10's precedent for this kind of
  scope line.
- [x] **UI**: an upload flow (`/o/[slug]/videos/upload` — start-upload
  form, then a client-side file picker that PUTs directly to Mux's
  signed URL — the first client-side JS this app has needed, since a
  browser can't PUT a file to an external signed URL through a plain
  form post), a "My videos" list, a watch page whose entire visibility
  check is the RLS-scoped lookup inside `getPlaybackUrl`, a video
  selector added to the existing post-creation form, and a staff
  moderation page. Confirmed via the real dev server, on a freshly reset
  database: the "My videos" and staff settings pages render correctly
  empty on clean data (repeating, yet again, the shared-local-DB
  verification lesson from Sessions 8-10 — caught the same leftover-state
  symptom on the settings page and reset before concluding anything),
  and — since no real Mux account exists yet — that actually attempting
  to start an upload fails **gracefully**: a clean redirect back to the
  form with Mux's own "Could not resolve authentication method" error
  message, no server crash, and no orphaned `video_assets` row left
  behind (confirmed directly against the database).
- [x] **The Mux client is constructed lazily** (`getMux()` in `lib/mux.ts`),
  not as a module-level singleton — `@mux/mux-node`'s constructor throws
  immediately if no credentials are configured at all, which was
  confirmed by reading the SDK's own source, not assumed. A module-level
  `new Mux()` would have crashed the entire app's build and dev server
  on import, not just the video feature, for as long as no real Mux
  account exists. Confirmed directly: `npm run build` succeeds with every
  `MUX_*` env var empty.

## Verified live against the real Mux account

Once the user created a Mux account and provided credentials
(`MUX_TOKEN_ID`/`MUX_TOKEN_SECRET`, a signing key, and — after registering
`https://trib4l.vercel.app/api/webhooks/mux` in the Mux dashboard, the one
step with no API equivalent, dashboard-only by design — a webhook signing
secret), all five were wired into Vercel (Production and Preview) and
production was redeployed to pick them up. Then, using the production
service-role key against `Trib4l-production`'s Supabase project directly
(infrastructure verification, not user-facing data — cleaned up
immediately after):

- [x] **A real Direct Upload** created via `mux.video.uploads.create` —
  confirmed a real upload id and PUT url came back.
- [x] **A real asset processed end-to-end through the actual deployed
  webhook route**: created a real Mux asset (using Mux's own official
  demo video as input, `test: true`, `passthrough` pointing at a real
  `video_assets` row) and watched Mux's real `video.asset.ready` webhook
  arrive at `https://trib4l.vercel.app/api/webhooks/mux`, get its
  signature verified for real, and correctly update the row: `status`
  went from `preparing` to `ready`, `moderation_state` to `approved`
  (correctly, since the actual duration was well under the 10-minute
  cap), a real `playback_id` was set, and `duration_seconds` matched the
  asset's actual length (10.14s) — end-to-end in about 3 seconds.
- [x] **A real signed playback JWT that actually authorizes playback**:
  `mux.jwt.signPlaybackId` against the real playback_id returned a token
  that, appended to `https://stream.mux.com/<id>.m3u8?token=<jwt>`, gave
  back a real, valid HLS manifest with a `200`. Checked the negative case
  too, not just the happy path: the same URL with no token gets `403`,
  and with a garbage token gets `400` — confirming the `signed` policy is
  actually enforcing something, not merely present but decorative.
- [x] All test rows (`video_assets`, `webhook_events`) and the Mux test
  asset were deleted immediately after — nothing from this verification
  pass was left behind in production.

This closes the gap the rest of this document originally flagged as
"blocked on real credentials" — the live Mux integration is now verified,
not just built against the SDK's types.

### A real gap the curl-only verification above didn't catch

The `curl`-against-`stream.mux.com` check above proved the signed JWT and
manifest are valid, but a `curl` request isn't a browser rendering a
`<video>` element — and the user's own real test through the actual UI
surfaced exactly what that verification missed: the watch page loaded but
never played. Root cause: a plain `<video src="....m3u8">` only plays HLS
natively in Safari (and old IE Edge) — every other browser needs a real
player on top (`@mux/mux-player-react`, which uses `hls.js` under the
hood) or nothing plays at all. Fixed by switching the watch page to
`<MuxPlayer playbackId={...} tokens={{ playback: token }} />` (confirmed
against the package's actual installed type definitions, same discipline
as verifying `@mux/mux-node` itself), and renaming
`getPlaybackUrl` → `getPlaybackAuth` to return the `{playbackId, token}`
pair the player needs instead of a raw `stream.mux.com` URL. A real
`curl` check proves a URL is reachable; it doesn't prove a browser can
actually render what's behind it — worth remembering next time "verified
live" gets written down.

## Pushed to hosted Supabase

Both new migrations pushed to `trib4l-staging` and `trib4l-production` —
the schema and RLS don't depend on Mux credentials to exist in the
database, only the application code calling out to Mux does. CLI left
linked to staging afterward, same safety practice as prior sessions.

## Not done in Session 11 — explicitly out of scope here

- **The full upload UI was not exercised with a real file picked in a
  real browser** — the live verification above created a Mux asset
  directly from a URL (`assets.create`) rather than driving
  `/o/[slug]/videos/upload`'s actual client-side file-PUT widget, since
  no test video file/recording tool was available in this environment.
  The upload-creation API call, the webhook pipeline, and signed
  playback are all verified for real; the literal "pick a file in the
  browser and watch the progress UI" path is built and code-reviewed but
  not click-tested.
- **The 30-day orphaned-video cleanup job** — the policy is decided and
  documented; no cron or scheduled function implements it yet.
- **Un-rejecting a video** (reverting `moderation_state` from `rejected`
  back to `approved`) — not asked for, and every other moderation action
  in this app (`moderate_post`, `moderate_comment`) is similarly
  one-directional.
