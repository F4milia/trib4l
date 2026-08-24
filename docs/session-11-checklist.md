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

This is the first session with a genuine third-party dependency (Mux) that
needs real account credentials to fully exercise. Per direct decision, the
user will create a Mux account and provide the keys; until then, the
schema/RLS/authorization layer — which is what the "done means" bar is
actually about — is fully built and verified, while the live API calls
(starting an upload, receiving a webhook, generating a real playback
token) are built but not yet exercised against a real Mux account. See
"Not done" below for the precise line between the two.

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

## Pushed to hosted Supabase

Both new migrations pushed to `trib4l-staging` and `trib4l-production` —
the schema and RLS don't depend on Mux credentials to exist in the
database, only the application code calling out to Mux does. CLI left
linked to staging afterward, same safety practice as prior sessions.

## Not done in Session 11 — explicitly blocked on real Mux credentials

- **Actually starting an upload against the real Mux API**
  (`client.video.uploads.create`), **receiving and verifying a real Mux
  webhook**, and **generating a real signed playback JWT**
  (`client.jwt.signPlaybackId`) are all built and typechecked against
  the SDK's real types, but have not been exercised against a live Mux
  account — there isn't one yet. Once credentials exist: `MUX_TOKEN_ID`/
  `MUX_TOKEN_SECRET` from a new API access token, `MUX_SIGNING_KEY`/
  `MUX_PRIVATE_KEY` from a new signing key pair, and `MUX_WEBHOOK_SECRET`
  last, since it's issued only after registering
  `https://<staging-domain>/api/webhooks/mux` as a webhook endpoint in
  the Mux dashboard.
- **The 30-day orphaned-video cleanup job** — the policy is decided and
  documented; no cron or scheduled function implements it yet.
- **Un-rejecting a video** (reverting `moderation_state` from `rejected`
  back to `approved`) — not asked for, and every other moderation action
  in this app (`moderate_post`, `moderate_comment`) is similarly
  one-directional.
