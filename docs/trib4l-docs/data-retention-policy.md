# Data retention: anonymize vs. purge

Written per the Session 1 requirement in
[`trib4l-build-from-zero.md`](../trib4l-build-from-zero.md#session-1--schema-auth-identity-and-the-role-model):
decide this now, before the tables that need it exist, because "hard deletes
cascading through forty tables at month eight is a genuinely bad week."

## The rule

Every table holding user-generated or user-identifying content gets a
`deleted_at timestamptz` column instead of supporting a hard `DELETE`. What
"deleted" means differs by table, and falls into three categories:

### 1. Anonymize on request

Content stays, the identifying link to the person is severed. Applies to:

- **`profiles`** — on deletion request, set `deleted_at`, scrub `display_name`
  to a generic placeholder ("Deleted user") and clear `avatar_url`. The row
  stays because `memberships`, `org_profiles`, `audit_log`, and (later)
  `mentor pairings` all hold a foreign key to it, and severing those would
  either cascade-delete records that must survive (see category 3) or leave
  orphaned rows.
- **`org_profiles`** — same treatment, per org.
- **posts, comments** (Session 6) — anonymize the author, keep the
  content, since a thread with "[deleted user]: ..." is a normal, expected
  pattern and the surrounding conversation still has value to the cohort.

### 2. Financial records — never purged

- Future: **`orders`, `order_items`** (Session 14) — these are financial
  records with tax and dispute retention obligations. A member's deletion
  request anonymizes their `profiles` row but never removes or blanks their
  order history. The order stays attributed to a now-anonymized profile ID.

### 3. Historical records that must survive the member who generated them

- **`memberships`** — soft-deleted (`deleted_at` set) rather than hard-deleted
  when someone leaves an org, so `audit_log` entries and (later) attendance
  and stage-progression history referencing that membership stay meaningful.
- **mentor pairing history** (Session 9) — a completed pairing belongs to
  the mentorship program's track record, not just to the two people in
  it. It survives either party's deletion request, same as orders.

### 4. Storage-cost-driven retention (Session 11)

The plan calls this out specifically: "member uploads make storage grow
monotonically" — a video, unlike a text post, has a real, ongoing per-GB
storage cost in Mux, so this category exists to keep that cost bounded
independent of anyone's deletion request.

- **`video_assets`** attached to a live post follow that post's own
  retention (category 1: anonymize the uploader, keep the content).
- A **rejected** video (`moderation_state = 'rejected'`, whether
  auto-rejected for exceeding the duration cap or rejected by a staff
  moderation decision) has its underlying Mux asset deleted immediately,
  reclaiming storage as soon as it's known the video will never be
  playable through this app again. Implemented in both places a
  rejection can happen: the webhook handler's `video.asset.ready` branch
  (over-cap case) and `moderateVideoAsset` (staff decision).
- **Decided now, not yet automated**: a `video_assets` row that reaches
  `ready`/`approved` but is never attached to any post is genuinely
  orphaned — nothing else in this app links to it. The policy is that
  such a video becomes eligible for deletion 30 days after it was marked
  ready if it still has no attaching post. No automated job enforces this
  yet (matching Session 10's explicit precedent: every state change in
  these early sessions is a deliberate staff or system action, not a
  background cron), but the number is decided and documented here so a
  future session implementing the cleanup job has a real policy to
  implement rather than having to invent one under storage-cost pressure.

### Never soft-deleted (there's nothing to delete)

- **`audit_log`** — append-only by construction. An audit trail that can be
  edited or removed after the fact isn't an audit trail. Rows reference
  `profiles`/`organizations` with `on delete set null`, so a purged actor
  still leaves the log entry intact with a null actor.
- **`webhook_events`**, **`idempotency_keys`** — infrastructure bookkeeping,
  not user content. Pruned by age if they ever become a storage concern, not
  by user request.
- **`organizations`** — soft-deleted only by `platform_admin` action
  (suspension/offboarding an org), never by an individual member's request.

## What a "delete my account" request actually does today

1. `profiles.deleted_at = now()`, `display_name` and `avatar_url` scrubbed.
2. Every `org_profiles` row for that profile gets the same treatment.
3. Every `memberships` row for that profile gets `deleted_at = now()` — the
   row stays (role history, join order relative to other events).
4. Nothing in `audit_log` changes; entries already recorded stay exactly as
   they were, still attributed to the now-anonymized profile ID until that
   profile itself is gone from view.

There is deliberately no cascading hard delete anywhere in this path. If a
table added in a later session needs different handling than the three
categories above, add it here explicitly — don't let a migration silently
introduce a fourth policy.
