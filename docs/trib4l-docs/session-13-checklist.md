# Session 13 — Connect Onboarding

Tracks progress against the Session 13 scope in
[`trib4l-build-from-zero.md`](./trib4l-build-from-zero.md): "Standard
account creation, hosted onboarding, `account.updated` webhooks.
`connected_accounts` with charges_enabled / payouts_enabled /
requirements state. Commerce hard-gated on `charges_enabled` — an
incomplete org sees storefront UI disabled, not broken."

Built as originally scoped (org-level), not per-Tower. The F4milia
handoff doc asks for commerce to be "dormant by default... activating
only when a specific Tower becomes a real venture," but Tower has no
spec yet (see the mentor/organizer role-model note in
`trib4l-build-from-zero.md` for the same class of gap). Reworking this
to be Tower-scoped is future work once that spec exists, not a defect
in what's built now.

## A real, live-API discovery, not assumed from training data

The plan's "Standard account creation" is a Stripe Accounts v1 concept.
The actual live API rejected it outright: *"Stripe no longer recommends
Accounts v1 for new Connect integrations... enable Accounts v1 support in
the Dashboard"* — this Stripe account defaulted to v2-only for new
Connect integrations. Resolved by enabling "Accounts v1 support" in the
Stripe Dashboard (Settings → Account features and previews) rather than
rebuilding against v2, since v2 is a materially different account model
(composable configurations instead of a single `type` flag) and the plan
explicitly assumes v1. Also: the `type` create param itself is deprecated
in this SDK version in favor of `controller` — mapped to the documented
Standard-account equivalent in `lib/stripe.ts`
(`STANDARD_ACCOUNT_CONTROLLER`).

## Done and verified

- [x] **`connected_accounts`** (`org_id`, `stripe_account_id`,
  `charges_enabled`, `payouts_enabled`, `requirements_due`,
  `disabled_reason`) — one per org, org_owner-scoped RLS (billing is
  org_owner scope, not organizer, per the original role table).
  `charges_enabled`/`payouts_enabled`/`requirements_due` have no update
  policy for `authenticated` at all — only the webhook (service_role)
  ever writes them.
- [x] **`startStripeOnboarding`** — creates the Stripe account (once;
  reuses the existing `stripe_account_id` on repeat calls, since Account
  Links are single-use) and redirects to Stripe's real hosted onboarding
  flow.
- [x] **`account.updated` webhook** — signature-verified, deduped via
  `webhook_events` same as Mux's, updates the matching row by
  `stripe_account_id`.
- [x] **Commerce settings page** (`/o/[slug]/settings/commerce`,
  org_owner-only) — not-started / incomplete (with the specific
  requirements Stripe still needs) / active states.
- [x] Isolation-tested: cross-role visibility, insert restricted to
  org_owner, and confirmed the update restriction is a hard grant-level
  deny (`42501`), not just an RLS filter.
- [x] **Verified against the real Stripe test API**, not stubbed: real
  account + hosted onboarding link created on both staging and
  production; a genuinely signature-verified `account.updated` event
  (via `stripe.webhooks.generateTestHeaderString`) confirmed to flip the
  UI from "Onboarding incomplete" to "Active" on staging. On production,
  a real permanent webhook endpoint was registered with Stripe
  (`we_1U8RacCA24ycPvywRPnj2LCV` → `https://trib4l.vercel.app/api/webhooks/stripe`)
  and both a validly-signed and a tampered-signature event were sent
  against it directly, confirming accept/reject both work with the real
  registered secret.
- [x] **Found and fixed a pre-existing, unrelated infrastructure gap**:
  `SUPABASE_SERVICE_ROLE_KEY` was never actually set for Vercel's
  Production scope at all (a "5 days ago" listing in `vercel env ls` had
  implied otherwise). This would have silently broken every
  service-role-dependent webhook on a Preview deployment touching
  production data, and reportedly did for staging Preview builds — fixed
  by setting the correct current key, sourced directly from Supabase,
  for both Preview and Production.

## Not verified — flagged to revisit when it matters

**The onboarding click-through itself has never been run by a real
person against production.** Carol (`carol@f4milia.test`) exists only in
local/staging seed data — production has no test users with that
password, and creating a real org_owner account there wasn't done as
part of this session. The exact same code was proven end-to-end on
staging with a real login (create account → hosted onboarding link →
webhook → UI reflects "Active"), and the part that's genuinely
environment-specific — the webhook, with production's own real secret —
was verified directly against production. But nobody has actually
clicked "Start Stripe onboarding" as a real production user yet.

**Revisit this before or during Session 14** (catalog and checkout),
since that's the first session where `charges_enabled` actually gates
something a real user sees. A quick sanity check with a real org_owner
completing onboarding for real, before checkout ships, closes this out
properly.

## Not done — explicitly out of scope this session

- Sales tax posture copy in the onboarding page (mentioned in the plan,
  low priority, easy follow-up).
- Tower-scoped activation (see above — no spec exists yet).
