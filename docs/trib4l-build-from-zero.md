# Trib4l — Build From Zero, v2.1

**Date:** August 20, 2026
**Replaces:** `trib4l-build-from-zero.md` (v1, 11 sessions)
**Status:** Current. Written for an empty repo. Assumes no Trib4l code exists — verify against GitHub, Vercel, and Supabase before Session 1.

**Revision note (v2.1):** platform hardening, transactional email, member safety, search, org-owner analytics, and multi-org identity are all now **in v1 scope**, not deferred. Session count 16 → 19, plus a Session 0.

---

## 0. What changed, and what it cost

| Addition | Effect on original scope |
|---|---|
| Platform admin dashboard | `platform_admin` was a known gap. Now a first-class role in Session 1 and a two-session console at the end. |
| Streaming (buy, don't build) | New. One provider, two sessions. |
| E-commerce in every community | **Reverses the "billing: out" cut.** Stripe becomes a Phase 3 pillar. |
| v1 hardening (this revision) | Ops baseline, email, safety, search, analytics, deletion policy. Three added sessions. |

**Session count: 11 → 19, plus Session 0.** The increase is honest, not padding. Commerce alone is four sessions because a per-org merchant model means onboarding, catalog, checkout, and fulfillment are separate problems.

**Still out, and staying out:** interactive video calls (broadcast + VOD only — see §7), Shopify, SMS/Twilio, marketing campaigns, CRM pipelines, AI features, physical inventory management, self-serve org signup.

---

## 1. Locked architectural decisions

Session 0–2 decisions. Changing any of them after Session 6 means rework, not iteration.

**Stack.** Next.js (App Router) on Vercel. Supabase for Postgres, Auth, RLS. Stripe Connect for commerce. Mux for all video. Resend or Postmark for transactional email. Sentry for errors. No other vendors in v1.

**One login, many communities.** A single auth user holds N `memberships` rows, unique on `(org_id, user_id)`. RLS is unaffected — policies ask "does this user have a membership in this org," which naturally permits many. Active org lives in the **URL path** (`/o/[slug]/...`), not session state, so it survives refreshes, deep links, and multiple tabs open to different communities.

**Identity is global, display is per-org.** One profile record; optional per-org display name and avatar overrides. Someone may be "Ivan R." in a business community and pseudonymous in the caregiving one. This is a Session 1 schema decision and is painful to retrofit.

**Five roles, and one lives outside the tenant model.**

| Role | Where it lives | Scope |
|---|---|---|
| `member` | `memberships` | Per-org row; a user may hold many |
| `mentor` | `memberships` | Per-org; a guide role via the Session 9 pairing lifecycle (proposed → active → completed) |
| `organizer` | `memberships` | Per-org; surfaces conflict and handles Family admin — cohort management, content moderation, member reports |
| `org_owner` | `memberships` | Per-org, billing + settings, plus role changes (promotions/demotions) |
| `platform_admin` | `platform_staff` | **All orgs. Not a membership.** |

`platform_admin` has its own table because it exists *above* orgs. Putting it in `memberships` means every RLS policy special-cases it, and that is how tenant isolation breaks quietly. Defined Session 1, tested Session 2, never bolted on.

**F4milia framing vs. current behavior — one gap.** "Organizer surfaces conflict and handles Family admin" is F4milia's intended meaning for the role, and it already holds for cohort management, moderation, and reports. It does *not* yet hold for `designate_mentor` (the member → mentor transition): that action runs under `memberships`' own role-change RLS, which has required `org_owner` specifically since Session 2 (Session 9 built the transition reusing that existing restriction, not a new one). An organizer cannot promote a member to mentor today. Confirmed working correctly end to end for an org_owner caller (isolation-tested); whether organizer should gain this ability is a product decision, not made here — this note exists so the description above doesn't overstate what's actually enforced.

**Commerce: orgs are the merchant.** Stripe Connect **Standard** accounts, **direct charges**, `application_fee_amount`. The connected account is merchant of record: pays Stripe fees, owns disputes, owns its sales tax obligation, has its own dashboard. Trib4l takes a platform fee and stays clear of merchant liability, tax nexus, and chargeback exposure.

**Two money systems that must never share code paths:**

1. **Community commerce** — members buy from orgs. Direct charges on connected accounts.
2. **Platform billing** — orgs pay Trib4l. Subscriptions on the Trib4l platform account.

Name them `commerce_*` and `platform_billing_*` so nobody merges them in month four.

**Known friction, accepted for v1:** with direct charges the Stripe Customer lives on the *connected account*. A member buying from two communities re-enters their card. The workaround (platform-account customers, payment methods cloned at charge time) pulls you back toward the merchant relationship you deliberately avoided. Accept the friction; revisit on complaint.

**Video: Mux, signed playback only.** Org live broadcasts, VOD library, and member video in posts are one provider. Every asset uses a **signed** playback policy; the app mints short-lived JWTs after a membership check. This is the single biggest isolation risk in the build — Mux assets are not behind your RLS, so a public playback ID is a permanent cross-org leak no database policy will catch.

**All writes are idempotent.** Webhooks dedupe via `webhook_events`, unique on `(provider, external_event_id)`, insert-before-process. User-initiated writes that cost money or create records carry client-supplied idempotency keys. A double-tapped checkout on bad signal must not create two orders.

**Time is stored in UTC with an IANA zone.** Never offsets. A recurring meetup is defined in the organizer's zone; storing offsets means DST silently moves it for everyone.

---

## 2. Non-negotiable invariants

Every session's acceptance criteria inherit these.

1. No query reaches a row outside the caller's org unless the caller is `platform_admin`.
2. No `platform_admin` capability is reachable by escalating an org-level role.
3. Every `platform_staff` account has 2FA enforced, and there are **at least two** of them.
4. Every impersonation session writes an audit row before the first impersonated request is served.
5. Every member is told in plain language, at signup, that platform staff can access their content for support.
6. No Mux playback ID is ever public.
7. No money moves without a corresponding `orders` row in the same transaction boundary as the intent.
8. Every migration is reversible, or explicitly marked irreversible with a written reason.
9. Every endpoint that costs money per call (video upload, checkout, email send) is rate-limited.

---

## 3. Session plan

### Session 0 — Operational baseline

Before any feature work. Environments (local / staging / production) with separate Supabase projects and Stripe/Mux test modes. Sentry wired to all three. CI running migrations and tests on every PR. Staging seeded with **realistic multi-tenant data** — at least three orgs, overlapping members, populated cohorts — because single-org staging data hides every isolation bug you have.

Backup and restore: not "Supabase does backups." An actual restore performed once, to staging, timed and documented.

*Done means:* a deliberately broken build fails CI, an exception in staging appears in Sentry, and someone has restored a backup and written down how long it took.

---

### Phase 0 — Foundation (Sessions 1–2)

**Session 1 — Schema, auth, identity, and the role model**

Core tables: `organizations`, `profiles` (global), `org_profiles` (per-org display overrides), `memberships`, `platform_staff`, `audit_log`, `webhook_events`, `idempotency_keys`.

Every tenant table carries `org_id` from the first migration. No exceptions.

Also settled here, because all three are schema:

- **Soft delete.** `deleted_at` on all user-generated content. A documented anonymize-vs-purge policy: `orders` are financial records with retention obligations and cannot be purged on request; posts and profiles can be anonymized; mentor pairing history must survive member deletion or the HQ dashboard loses its history. Write the policy down now — hard deletes cascading through forty tables at month eight is a genuinely bad week.
- **Timezones.** UTC timestamps plus IANA zone on profiles and on recurring event definitions.
- **Idempotency keys** table and middleware.

*Done means:* three orgs seeded with an overlapping user, two `platform_staff` rows, migrations clean forward and back.

**Session 2 — RLS, isolation suite, and platform access control**

Cohort-scoped RLS across all Session 1 tables. `platform_admin` bypass as an explicit policy clause referencing `platform_staff` — never a service-role key sprinkled through the app. 2FA enforcement on `platform_staff` login.

The test suite is the deliverable. Minimum cases: member cannot read another org's rows; organizer cannot read another org's rows; `org_owner` cannot write to `platform_staff`; no org role can grant itself `platform_staff`; a user with memberships in Orgs A and B sees exactly A's and B's rows and nothing from C; `platform_admin` reads across orgs and every read is logged.

*Done means:* isolation tests pass in CI and the escalation test fails loudly if the bypass policy is loosened.

---

### Phase 1 — Community core (Sessions 3–10)

**Session 3 — Org provisioning, onboarding, multi-org shell.** Orgs created by `platform_admin` only. Org settings and branding. Invitation flow that **adds a membership row for an existing user** rather than erroring on account-exists — universally missed on the first pass. Org switcher in the shell, path-based active org. Platform-staff-access consent copy ships here.

**Session 4 — Transactional email.** Resend or Postmark. Invites, receipts, meetup reminders, mentor pairing notices, password resets, digest scaffolding. **Per-org notification preferences** — three communities on one address with global settings means everything gets muted by week two. Deliverability basics: SPF, DKIM, custom sending domain.

Nothing downstream works without this. A community platform that cannot say "your meetup starts in an hour" is not a community platform.

**Session 5 — Cohorts.** `cohorts`, `cohort_members`. Cohort-scoped visibility layered under org scoping. A member sees org-wide content plus their own cohort's, nothing from sibling cohorts.

**Session 6 — Posts and feed.** Threads, comments, reactions. Organizer moderation with `audit_log` writes. Index `(org_id, cohort_id, created_at)` now — this is where the first performance wall appears.

**Session 7 — Search and member safety.** Postgres full-text over posts and comments, org- and cohort-scoped. Cheap now, awkward later: once a cohort has 400 posts, the mentorship value is locked inside content nobody can find.

Member-to-member **reporting and blocking** — distinct from organizer content moderation. "I don't want to see this person" is a safety requirement in a vulnerable-population community, not a nice-to-have. Reports route to organizers with an escalation path to `platform_admin`.

**Session 8 — Stages.** Stage definitions per org, assignment, progression events, content gating. Transitions are logged; the log feeds the HQ and org dashboards.

**Session 9 — Mentorship.** Mentor designation, pairing model, lifecycle (proposed → active → completed). Build the **member → mentor transition** as an explicit, first-class action with its own record and UI moment. In the caregiver vertical this is the engine, not a feature.

**Session 10 — Meetups.** Events, RSVP, attendance recording, recurrence in the organizer's timezone. Attendance is a **first-class record an organizer can mark manually**, so the metric survives regardless of where the call happens. Store `meeting_provider` plus URL rather than hardcoding an external link — later, `provider = 'livekit'` is a swap, not a migration.

---

### Phase 2 — Video, via Mux (Sessions 11–12)

**Session 11 — Video foundation and member uploads.** `video_assets` (org_id, uploader, mux_asset_id, playback_id, policy, status, duration, moderation_state). Signed direct uploads, Mux webhooks through the idempotent handler, signed playback JWTs behind a membership check. Rate limiting on the upload endpoint.

Member video in posts with hard caps on duration and file size, and a **retention policy set here, not after the first invoice** — member uploads make storage grow monotonically.

*Done means:* a member in Org A cannot play an Org B asset while holding the playback ID, and a test proves it.

**Session 12 — Live events and VOD library.** Organizer-created live streams, RTMP ingest keys, auto-archive into VOD. Library UI with stage and cohort entitlement filtering. Entitlement resolution shares one code path with Session 11 — do not fork it.

---

### Phase 3 — Commerce, via Stripe Connect (Sessions 13–16)

**Session 13 — Connect onboarding.** Standard account creation, hosted onboarding, `account.updated` webhooks. `connected_accounts` with charges_enabled / payouts_enabled / requirements state. Commerce hard-gated on `charges_enabled` — an incomplete org sees storefront UI disabled, not broken. Sales tax posture documented in the onboarding copy: it belongs to the connected account.

**Session 14 — Catalog and checkout.** `products` (org_id, type, price, currency, active), type ∈ digital | physical | ticket | cohort_seat. Cart, direct charge with `application_fee_amount`, `orders` and `order_items`. Idempotency keys on checkout. Rate limiting.

**Session 15 — Fulfillment, entitlements, refunds.** Digital delivery. Entitlement grants — a `cohort_seat` purchase actually enrolls; a course purchase grants VOD access via Session 12's resolver. Order state machine. Refunds including application fee reversal. Physical products get address capture and manual fulfillment status only.

**Session 16 — Benefits marketplace.** Vendor offers, `offers.our_compensation` disclosure surface, redemption tracking. Shares `orders` with Session 14 but a **separate permission model** — vendors are not orgs and must not inherit org roles. Where Trib4l or an affiliated entity is also the vendor in a category, the prominent-disclosure block plus the unaffiliated-referral-on-request line renders here.

---

### Phase 4 — Dashboards (Sessions 17–19)

**Session 17 — Org owner analytics.** The dashboard for the people paying you. Member growth and churn, cohort engagement, meetup attendance rate, stage progression, mentor pairing activity, and their own commerce numbers. Org-scoped, no cross-tenant leakage.

This is the churn conversation. An `org_owner` paying monthly with no view of their own community's health cancels and cannot tell you why.

**Session 18 — HQ: health, provisioning, support.** Cross-tenant org list: active members, attendance rate, posts in last 14 days, active pairings, stage distribution. Org provisioning and suspension. Audited impersonation — audit row before the first request, time-boxed auto-expiring sessions, visible banner throughout.

**Session 19 — HQ: revenue ops and platform billing.** GMV by org, application fee revenue, payout state per connected account, refunds and disputes, accounts stuck in onboarding. Platform side: subscription plans, org plan assignment, seat/usage limits, dunning.

*Done means:* `platform_admin` sees one number for what the platform earned this month, can trace it to orgs, and no org-level role can reach any of it.

---

## 4. Cost drivers to price before Session 11

Pull current rate cards at build time; don't take them from memory.

- **Mux:** encoding, storage, and delivery bill separately. Member-uploaded video makes storage grow forever — the retention policy in Session 11 is the control.
- **Stripe Connect:** with Standard accounts and direct charges, processing fees are the connected account's cost. Yours is the Connect platform fee structure — confirm which tier applies.
- **Email:** per-send pricing is trivial until meetup reminders fan out across every cohort.
- **Supabase:** RLS-heavy queries on a growing `posts` table is the first wall.

---

## 5. Still open, still yours

1. **Which company is this** — placement agency, or community platform with placement as a benefit? This plan builds the platform. You have not formally made that call.
2. **Runway.** Nineteen sessions. The handoff flagged twice that nothing scoped produces revenue in 90 days; this widens the gap. Name the funding source before Session 0.
3. **Member video moderation** — pre-approval or post-report? Changes Session 11's UX and your exposure.
4. **Video retention window** — sets your Mux storage bill directly.
5. **Which three vendor categories** launch in the marketplace. Three, not eight.
6. **Cohorts free or paid?** Now cheap — Session 14's `cohort_seat` type covers paid with no added sessions.
7. **Terms of service and vendor agreements.** You are now a payments platform. Connect platform obligations and member-facing terms need a lawyer before Session 13 ships.
8. **Second `platform_admin` — who?** Invariant 3 requires a person, not a plan. One compromised account exposes every org's private caregiver conversations, and you have told members in writing that staff can access their content.

---

## 6. Scoping question for the devs

Time-boxed, in writing, before anything is built:

> Given an empty repo and this stack, what is your honest estimate for Sessions 0–2 — operational baseline, multi-tenant foundation with four membership roles plus an out-of-tenant `platform_admin`, multi-org identity, cohort-scoped RLS, and a passing isolation suite including a privilege-escalation test?

An estimate, not a build. How they answer tells you more than the number.

---

## 7. Deferred, deliberately

**Interactive video calls.** Members are family caregivers, older-skewing and mid-crisis. They have Zoom installed and know where the mute button is. An embedded browser room adds friction exactly where showing up is fragile, and "my camera isn't working" becomes your support ticket filed by someone already exhausted.

Session 10 preserves the option at zero cost: manual attendance records and a `meeting_provider` field.

**Revisit when** an org asks why call recordings aren't in the library, or when you want attendance data badly enough to provision Zoom host accounts for organizers. The second is the real trigger — at the moment you'd pay for a Zoom integration, building is the better buy.
