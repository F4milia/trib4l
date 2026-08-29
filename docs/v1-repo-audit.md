# V1 — Repo audit against the prior prompt lists

**Wave 0, Stream B** · **Date:** 2026-08-30 · **Executor:** James Jarin ·
**For review:** Ivan Rattliff, 09:30

Audited against the two handoff documents in `prompt-handoff/`:
**`F4milia — Ferenz's Prompts.md`** and **`F4milia — James's Prompts.md`**.

No code, schema, or config was changed. This session's `git diff` shows this
file and nothing else.

---

## Before the table: the V1 prompt's item numbers don't match the handoff docs

The V1 prompt asks for three ranges. Read against the actual handoff docs, two
of the three are mislabelled and one describes items that do not exist in
either document. This matters because Ivan is being asked to slot work by item
number.

| V1 prompt says | What the handoff docs actually contain | Verdict |
|---|---|---|
| "Ferenz's backend items **12.1–12.6** (Program Partner: `program_partners`, `family_program_enrollments`, aggregate endpoints, privacy floor)" | Ferenz's 12.1–12.6 are transactional email (12.1–12.4) and commerce Sessions 13–14 (12.5–12.6). **No Program Partner section exists** in either doc. | **mislabelled, and the described items are absent** |
| "**13.1–13.19** (transactional email, commerce sessions 13–16, reshaped analytics, HQ dashboard, three-tier billing)" | That is an exact, item-for-item description of **Ferenz's 12.1–12.19** — nineteen items, same five areas, same order. Ferenz's doc has no section 13; **James's** 13.1–13.5 are the matching UI items. | **off by one section — audited as Ferenz 12.1–12.19** |
| "old James items **15.1–17.1** (HQ UI, billing UI, Family settings)" | James's 15.1 (HQ dashboard UI) and 16.1 (billing management UI) exist. **17.1 does not exist in James's doc**, which ends at 16.1 — it survives only as a forward reference in Ferenz's 0.7: *"James builds the Family settings + billing interface UI on top of this — his new item 17.1."* | **15.1 and 16.1 audited as written; 17.1 audited against Ferenz 0.7, the only place its scope is defined** |

**On "Program Partner":** `grep -i` for `program partner`, `program_partner`,
`enrollment`, `privacy floor`, and `aggregate` across both handoff files
returns exactly one hit — the word "aggregates" in Ferenz's 2.1, describing the
Family Night rollup job. There is no `program_partners` table, no
`family_program_enrollments`, no aggregate endpoint, and no privacy floor in
the handed-over prompts, and none in the repository either.

Ferenz's doc explains the drift: *"What's new in this version: … Sessions 4 and
13–19 are now written at the same prompt granularity as everything else, not
left as prose summary."* Inserting Family Night (§2) and Data Governance (§8)
renumbered every later section, which is consistent with the V1 prompt citing
"13.1–13.19" for what is now 12.1–12.19.

**The question for 09:30:** does a Program Partner list exist in a third
document that wasn't handed over? If it does, this audit does not cover it and
`program_partners` / `family_program_enrollments` / the privacy floor remain
**unaudited, not missing**. If it doesn't, that half of the V1 prompt is a
carry-over from an abandoned draft and should be struck.

## What was actually executed for this report

Stated per the "never state a verification that was not executed" rule.

| Check | How | Result |
|---|---|---|
| Schema inventory | `grep "create table"` over all 43 migrations | 33 tables, listed below |
| Column-level checks | read `lib/supabase/database.types.ts` (generated from the live schema) | authoritative for what columns exist |
| Feature presence | `grep -ril` per keyword over `supabase/ app/ lib/ tests/ docs/` | per row below |
| Route presence | `find app -type f` | 54 files, full list read |
| Code read in full | `app/api/webhooks/stripe/route.ts`, `app/actions/organizations.ts`, `tests/isolation/platform-admin.test.ts`, `lib/commerce.ts`, `lib/org-nav.ts` | quoted below |
| CI state on `main` | `gh run view 33264519508 --json jobs`, at `4e930d4` | `migrations`, `build-and-test`, `isolation` — all **success**, 2026-08-29 |
| Test inventory | `grep -c "it("` over `tests/isolation/*.test.ts` | 89 cases, 16 files |

**Not executed, and not claimed anywhere below.** The suites were not run in
this worktree — `node_modules` is absent here and installing it is outside an
audit session's remit; every "tests passing" claim rests on the green CI run on
`main` above. Nothing was checked against staging or production; where the
session log is the only evidence for a live-API fact, the row says so.

**One tooling note, so the evidence trail is honest:** reading the handoff docs
required `cd`-ing into `prompt-handoff/`, which sits in the shared checkout
rather than this worktree. That left the shell's working directory outside the
worktree and the isolation guard then refused every subsequent shell command,
including `cd` back. The last four checks in the table above were completed with
the file reader instead of `grep`; each one reads a whole file rather than
matching a pattern, so the claims drawn from them are narrower and are worded
that way. No check listed as executed was skipped.

**Tables that exist today** (the whole schema): `organizations`, `profiles`,
`org_profiles`, `memberships`, `platform_staff`, `audit_log`, `webhook_events`,
`idempotency_keys`, `invitations`, `cohorts`, `cohort_members`, `posts`,
`comments`, `reactions`, `reports`, `blocks`, `member_reports`, `member_blocks`,
`stages`, `member_stages`, `stage_transitions`, `mentor_pairings`, `meetups`,
`meetup_series`, `meetup_rsvps`, `meetup_attendance`, `video_assets`,
`live_streams`, `live_stream_credentials`, `connected_accounts`, `products`,
`orders`, `order_items`.

---

## Ferenz 12.1–12.19 — the nineteen backend items

### Session 4 — Transactional email

| Item | Scope | Verdict | Evidence |
|---|---|---|---|
| **12.1** | Resend/Postmark + SPF/DKIM + custom sending domain | **missing** | No mail provider in `package.json` (no `resend`, `postmark`, `nodemailer`). `grep -ril "resend\|sendEmail\|email_template"` over `app/ lib/ components/ supabase/ tests/` → zero hits. `.env.example` reserves `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` under `# --- Transactional email (Session 4) ---`; nothing reads either. `supabase/config.toml` leaves `[auth.email.smtp]` commented out, so auth mail runs on Supabase's built-in mailer with default templates — no custom domain, no SPF/DKIM. |
| **12.2** | Templates: Family invite, Family Night digest, Vow notification, password reset | **missing** | No template files anywhere. Note two of the four have no subject to describe yet: Family Night (Ferenz §2) and Vows (§3.2) have no schema in this repo. |
| **12.3** | Per-Family notification preferences (schema + toggle logic) | **missing** | No preferences table in the 33-table inventory. `grep -ril "notification"` over `supabase/ app/ lib/ tests/` → one hit, `supabase/config.toml`. This is the item James's 13.1 and the run doc's N1 both consume. |
| **12.4** | Tests: template rendering, preference-respecting delivery | **missing** | Nothing to test; no such test file exists. |

Adjacent, same session, worth recording: the invitation **mechanism** is built
and isolation-tested (`invitations` table, `app/actions/invitations.ts`,
`/o/[slug]/settings/members`, 5 test cases green in CI). What's missing is
delivery — `docs/session-3-checklist.md` states it: *"Actual email delivery for
invitations… Session 4 adds the transactional email that would send the invite
link automatically."* Today an invitee finds out because somebody tells them.

### Sessions 13–16 — Commerce, dormant-per-Tower

| Item | Scope | Verdict | Evidence |
|---|---|---|---|
| **12.5** | (S13) Connect Standard onboarding, `connected_accounts`, `account.updated` — **"Gate this so it only activates when a specific Tower is marked as a venture — never globally per Family"** | **partial** | *Built:* migrations `20260831100101_connected_accounts.sql` + `_rls`; `startStripeOnboarding` in `app/actions/commerce.ts`; `account.updated` handled at `app/api/webhooks/stripe/route.ts:41`; UI `/o/[slug]/settings/commerce`, `org_owner`-gated; `tests/isolation/connected-accounts.test.ts`, 4 cases, green in CI. Live-API verification recorded in `docs/SESSION-LOG.md`. *Not built — the gate:* activation is per-**org** (`connected_accounts.charges_enabled`), not per-Tower. `docs/session-13-checklist.md` lists under "Not done": *"Tower-scoped activation (see above — no spec exists yet)."* The gate cannot be built as written until a `towers` table exists (Ferenz 3.1), which it does not. **This is the invariant CLAUDE.md states as "Commerce is dormant-per-Tower".** |
| **12.6** | (S14) `products`, checkout, direct charge + `application_fee_amount`, `orders`/`order_items`, idempotency, rate limiting | **done** | Migrations `20260901110101_products_and_orders.sql` + `_rls`; `app/actions/checkout.ts`, `products.ts`; UI `/o/[slug]/shop`, `/settings/products`; idempotency via `lib/idempotency.ts`; rate limit 5 per buyer per 60s in `lib/commerce.ts`; `application_fee_amount` at `app/actions/checkout.ts:117`; `tests/isolation/products-and-orders.test.ts`, 8 cases, green in CI. |
| **12.7** | (S15) Fulfillment, entitlements, order state machine, refunds incl. application-fee reversal | **missing** | `refunded` exists as an `order_status` enum value only. Reading `app/api/webhooks/stripe/route.ts` end to end: the switch handles `account.updated`, `checkout.session.completed`, `checkout.session.expired`, and ignores everything else — there is no refund event case and no fee-reversal call. No entitlement grant on a `cohort_seat` purchase, no digital delivery, no address capture. `docs/session-14-checklist.md` says it plainly: *"a `cohort_seat` purchase doesn't actually enroll anyone yet, digital products have nothing to deliver (Session 15)."* |
| **12.8** | (S16) Benefits marketplace, `offers.our_compensation` disclosure, redemption tracking, vendor permission model | **missing** | `grep -ril "vendor"` over `supabase/ app/ lib/ tests/` → zero hits. No `offers` table in the inventory. |
| **12.9** | Tests for 12.5–12.8, following Session 1's idempotency and webhook-dedup patterns | **partial** | *Present and green:* 12 isolation cases across `connected-accounts` (4) and `products-and-orders` (8), plus `lib/idempotency.test.ts`. The dedup pattern is implemented as specified — the Stripe route inserts into `webhook_events` first and treats a `23505` unique violation as a replay (`route.ts:31-38`). *Absent:* everything for 12.7 and 12.8, which have no code to test. |

### Session 17 — Family/Ledger health analytics (reshaped)

| Item | Scope | Verdict | Evidence |
|---|---|---|---|
| **12.10** | Queries surfacing Table streak, Bricks completed, Ledger density — replacing Trib4l's growth/churn metrics | **missing, and blocked upstream** | No such query or endpoint exists. More fundamentally, all three inputs are absent from the schema: no `table_entries` (Ferenz 1.1), no `bricks` (4.2), no `ledger_events` (6.1), and no streak calculation (1.3). This item cannot be built until those land. |

### Session 18 — HQ: platform-operator dashboard

| Item | Scope | Verdict | Evidence |
|---|---|---|---|
| **12.11** | Cross-tenant Family health queries: streaks, recent Ledger activity, active pairings, Tower status distribution | **missing** | No cross-tenant query exists; `find app -path "*admin*"` returns exactly one file. Three of its four inputs (streaks, Ledger activity, Tower status) have no schema; `mentor_pairings` does exist. |
| **12.12** | Family provisioning **and suspension** endpoints | **partial** | *Provisioning: built.* `createOrganization` in `app/actions/organizations.ts` — read in full, 38 lines, one exported function — gated by `requirePlatformAdmin()`, creates the org and optionally an `org_owner` invitation; UI at `/admin/organizations/new`. *Suspension: absent.* No suspend action, and `organizations` carries no suspension column — its full generated type is `id, slug, name, settings, created_at, updated_at, deleted_at`. Only the soft-delete column exists, and nothing calls it. |
| **12.13** | Audited impersonation: audit row before the first impersonated request, time-boxed auto-expiring sessions | **missing — but the hard primitive already exists** | No impersonation anywhere. Worth knowing before this is scoped: `withAdminAudit` (`lib/audit.ts`) already implements exactly the "audit row **before** the wrapped operation runs" pattern this item needs, and `tests/isolation/platform-admin.test.ts` proves it — the fourth case asserts the `admin_list_organizations` row is written and readable. What's left for 12.13 is session assumption, expiry, and the banner, not the audit discipline. |
| **12.14** | Tests: impersonation audit trail, provisioning/suspension correctness | **partial** | `tests/isolation/platform-admin.test.ts`, read in full: four cases covering the `platform_admin` bypass, its MFA (aal2) gating, non-staff denial at aal2, and the admin-audit primitive. It does not test provisioning or suspension, and no test file in the 16-file suite is named for provisioning, suspension, or impersonation. |

### Session 19 — Three-tier platform billing

| Item | Scope | Verdict | Evidence |
|---|---|---|---|
| **12.15** | `billing_model` (`free`/`subscription`/`profit_share`) on the Family record, settable only by `platform_staff` | **missing** | The generated `organizations` type has seven columns and `billing_model` is not among them. No enum of that name exists. |
| **12.16** | Subscription billing path | **missing** | No plans table, no plan assignment, no seat/usage limits, no dunning, no invoices. |
| **12.17** | Profit-share path via `application_fee_amount`, **flagged not-for-production until legal sign-off** | **partial — and this is the finding to read twice** | The fee mechanism exists and is **live**: `PLATFORM_TAKE_RATE = 0.2` in `lib/commerce.ts` feeds `applicationFeeAmount()` into `payment_intent_data.application_fee_amount` on every Checkout Session (`app/actions/checkout.ts:117`). Because 12.15 was never built, there is no `billing_model` to gate it — the profit-share take is applied **unconditionally to every org**, not to profit-share Families only, and nothing in the code path carries the not-for-production flag this item requires. Per `docs/SESSION-LOG.md` a real (test-mode) checkout completed on production through the real webhook, so this path has run outside local. |
| **12.18** | Platform-side revenue tracking: GMV by Family, application fee revenue, payout state per connected account | **missing** | No query, endpoint, or route. `connected_accounts` stores `payouts_enabled` but nothing aggregates or reports on it. |
| **12.19** | Tests for 12.15–12.18 | **missing** | Nothing to test. |

---

## James 15.1, 16.1, 17.1 — the items the V1 prompt names

| Item | Scope | Verdict | Evidence |
|---|---|---|---|
| **15.1** | HQ dashboard UI: cross-Family health list, provisioning/suspension controls, impersonation banner | **partial — one of four** | *Present:* the provisioning screen, `/admin/organizations/new`, correctly `platform_admin`-gated, plus the access primitives it sits on (`am_i_platform_admin` RPC, the `platform_staff` RLS bypass clause, `requirePlatformAdmin`), with 6 platform-admin and 3 role-escalation isolation cases green in CI. *Absent:* the cross-Family health list, suspension controls, and the impersonation banner — all three of whose backends (12.11, 12.12-suspension, 12.13) are also absent. A compounding blocker disclosed in `docs/session-3-checklist.md`: there is **no MFA enrollment/verification UI**, so a real `platform_staff` account cannot complete its aal2 challenge through this app at all — it has to be driven via the Supabase client API directly. Every HQ surface is unreachable in practice until that ships. |
| **16.1** | Platform billing management UI for `platform_staff`: set a Family's `billing_model`, view revenue by Family | **missing** | No such route. `/o/[slug]/settings/commerce` is **not** this item — it is James's 13.2, the tenant-facing Connect onboarding UI, and it renders only `not_started`/`incomplete`/`active` from `connected_accounts`. There is no platform-side billing surface, and its backend (12.15, 12.18) does not exist. |
| **17.1** | Family settings + billing interface UI. Per Ferenz 0.7, the `org_owner` scope: *"Family-level settings (Table prompt time, notification preferences, general configuration)"* and *"the billing interface on a subscription-tier Family (viewing charges, managing payment method)"* | **partial — none of the four named capabilities** | *Present:* eleven per-surface settings pages (`members`, `cohorts`, `stages`, `mentorship`, `meetups`, `videos`, `live`, `products`, `reports`, `member-reports`, `commerce`), role-gated through `lib/org-nav.ts` with page-level enforcement, and `org_owner` correctly distinguished from `organizer` for commerce. *Absent, item by item:* **Table prompt time** — no column on `organizations` (seven columns, none of them a time or a timezone; `profiles.timezone` is per-user and `meetups`/`meetup_series` each carry their own). **Notification preferences** — no table (12.3). **General configuration** — `organizations.settings` (jsonb) exists and nothing writes it; `docs/session-3-checklist.md` states *"`organizations.settings` (jsonb, from Session 1) exists but nothing writes to it yet."* **Billing interface** — no charge history, no payment method surface (12.15/12.16). There is also no settings index route. |

**A prerequisite for 17.1 that is worth naming here**, because 17.1 assumes it:
Ferenz 0.6 asks for `memberships.role` to be replaced by a `membership_roles`
join table so `org_owner` can **overlap** with `organizer` or `mentor`. It has
not been done — migration `20260820212525` still defines `membership_role` as a
single mutually-exclusive enum (`member`, `mentor`, `organizer`, `org_owner`),
and the unique constraint is `(org_id, profile_id)`, one role per person per
Family. `org_owner` exists as a value but cannot be held alongside another
role. 0.6 is outside the three ranges the V1 prompt names, so it is flagged, not
audited.

**Adjacent James items, for pairing at 09:30** (not in the V1 prompt's ranges,
but each is the UI half of a Ferenz item audited above): 13.1 prefs UI —
**missing** (backend 12.3 missing); 13.2 Connect onboarding UI — **done**; 13.3
catalog/checkout UI — **done**; 13.4 order-status/refund UI — **missing**
(backend 12.7 missing); 13.5 marketplace UI — **missing** (backend 12.8
missing); 14.1 Family health dashboard UI — **missing** (backend 12.10
missing).

---

## Dependencies — what later waves actually assume

Method: `grep` over every session prompt in `F4milia — Complete Run Doc
(Prompts Included).md` for each item's terms, then read the matching prompt's
acceptance criteria. Every claim below quotes prompt text.

### Upstream — a later wave assumes it and will stall or invent without it

**1. Ferenz 12.1–12.4 (transactional email) + 12.3's preference schema.**
The wave table says *"E1 gates all notification work"*, and Wave 1 Stream B is
written conditionally: *"run only if V1 shows it missing"*. **This audit shows
it missing.** Consumers, by their own prompt text:
- C2 (Wave 3 A): *"@mentions with notification records (delivery UI arrives in N1 — write the rows now)"*
- D2 (Wave 3 B): *"Reminder toggles per item write preference rows (delivery arrives in N1)"*
- N1 (Wave 4 A): *"Consumes E1's preference schema"* — and *"A muted type does not deliver — in-app or push"*
- Q2 (Wave 9 A): rate limiting on email

→ **Slot: Wave 1, Stream B (E1), as already written.** Upstream of Wave 3.

**2. James 17.1's schema half — Family-level Table prompt time and timezone.**
Two later acceptance criteria name a Family-level setting that has no column:
- D2 (Wave 3 B): *"Calendar respects the Family's stored timezone"*
- N1 (Wave 4 A): *"The daily Table prompt push fires at the Family's chosen time in the Family's timezone"*

Neither value exists on `organizations`. → **Slot: Wave 1, Stream B, inside
E1's migration PR** — these are two small columns and they belong with 12.3's
preference schema; per the standing workflow the migration ships as its own PR.
Upstream of Wave 3. The **UI** half of 17.1 can trail to Wave 4 alongside N1.
If the columns slip past Wave 2, D2 will either invent a per-user fallback or
hardcode UTC.

**3. A `platform_staff`-facing view (part of 12.11 / 15.1).**
H1 (Wave 7 B) acceptance: *"a submitted form reaches the staff view and writes
an audit row."* No staff view exists — `app/admin` holds one provisioning page
— and the missing MFA enrollment UI means a staff account cannot sign into one
today.
→ **Cheapest correct slot: re-cut H1's own scope** to include the minimal staff
inbox it needs, rather than opening a session for it; nothing else reads that
surface. The **MFA enrollment UI stays with S2 (Wave 1)**, which already owns
2FA — without it H1's acceptance cannot be demonstrated by a human.

### Already scheduled — missing, but the run doc owns it

**4. Reshaped analytics is *not* one of these** — see below. The only run-doc
session in this space is Q3 (Wave 9 A), which is PostHog product analytics
(*"event names and anonymous counts only… write the scrubbing test before the
first event ships"*), a different thing from Ferenz 12.10's Family-health
queries. PostHog is absent from the repo (`grep -ril "posthog"` → zero hits;
`instrumentation-client.ts` is Sentry only) and Q3 remains correctly slotted at
Wave 9. Invariant 4 is not currently violated: zero events ship, so the
scrubbing test still precedes the first event.

### Backlog — nothing in Waves 1–10 depends on it

**5. Ferenz 12.5's Tower venture-gate.** No run-doc session touches commerce —
pre-flight item 1 states it: *"No Stripe globs — commerce stays dormant-per-Tower
and nothing in this doc touches it."* The gate is also **blocked on schema that
doesn't exist** (a `towers` table, Ferenz 3.1, which no wave creates).
→ **Backlog**, but see finding B: the invariant it implements is currently
unenforced in a live payment path.

**6. Ferenz 12.7, 12.8 (Commerce S15, S16) and James 13.4, 13.5.** Same
pre-flight decision; no wave session references orders, products, refunds, or
vendors. → **Backlog.**

**7. Ferenz 12.10 and James 14.1 (Family health analytics).** No wave session
consumes them, and they are blocked on `table_entries`, `bricks`,
`ledger_events`, and the streak calculation — none of which exist.
→ **Backlog**, behind the Family-layer schema (finding C).

**8. Ferenz 12.11, 12.13, 12.12-suspension, 12.14 and James 15.1 (full HQ).**
Beyond the minimal staff view H1 needs (item 3 above), no wave session reads
cross-tenant health, suspension, or impersonation. → **Backlog.**

**9. Ferenz 12.15–12.19 and James 16.1 (three-tier billing).** No wave session
touches billing; invariant 10 blocks profit-share activation on legal sign-off.
→ **Backlog** — with the live-fee flag in finding A raised now, not deferred.

---

## Four findings that need a decision, not a slot

Reported, not acted on.

**A. The profit-share take is live and ungated.** 12.17 requires the
profit-share path to be *"flagged as not-for-production until the legal sign-off
happens"*, and 12.15 is the `billing_model` field that decides which Families it
applies to. 12.15 was never built, so the 20% `application_fee_amount` is
applied to **every** org's checkout from a hardcoded constant, with no
billing-model gate and no not-for-production flag in the code path — and per the
session log it has run on production. Ivan's calls: whether that sits inside
invariant 10, and whether the fee must be disclosed in the tenant-facing UI
before any non-test money moves (it appears in no screen — `lib/commerce.ts` and
`checkout.ts` are the only places the rate exists).

**B. "Dormant-per-Tower" is not implemented, and cannot be yet.** CLAUDE.md
states commerce is dormant-per-Tower; 12.5 says *"never globally per Family."*
The built gate is per-org. This is disclosed in `docs/session-13-checklist.md`
as blocked on a spec, and it is also blocked on the `towers` table. Until then,
a Family that completes Connect onboarding has commerce enabled Family-wide.

**C. The Family layer has no schema at all.** Outside the three ranges, but it
dominates the slotting question. There is no `table_entries`, `towers`, `vows`,
`builds`, `bricks`, `care_actions`, `ledger_events`, `contribution_ledger`,
`conversations`, `messages`, or notifications table — the schema is Trib4l's
org/cohort/posts model. Sessions whose acceptance criteria name those objects
directly: D1 and D2 (Waves 2–3: *"Tower progress… claimed Bricks… current Vow
holder"*), C1 and C2 (Waves 2–3), N1 (Wave 4), F1 and F2 (Wave 5: *"Bricks and
Ledger events"*), A2/A3/A4 (Wave 6), A5 (Wave 7: `contribution_ledger`), K1
(Wave 8). D1 is scoped as *"Read-only UI over existing tables — no migrations in
this session"* and the tables it reads do not exist. Ferenz's §§1–9 are exactly
this work and no wave in the run doc schedules them. This is the one item that
likely forces the wave table to be re-cut rather than appended to.

**D. The PARKED section's assumption is wrong.** The run doc reads:
*"Profit-share activation — built (if V1 confirms) but not-for-production until
legal sign-off."* **V1 confirms it is not built** — 12.15–12.19 are missing
entirely; what exists is finding A's ungated constant. Separately, the repo's
only billing spec (`docs/revenue-model-and-mentor-compensation.md` §1) describes
**four** rungs — Free 20% / Growth 10% / Scale 6% / Owned 4% — while Ferenz 12.15
describes **three** models (`free`/`subscription`/`profit_share`). These are two
different schemes, not two namings of one. Someone has to say which is
authoritative before 12.15 is built.

---

## Summary

| Verdict | Items |
|---|---|
| **Done (2)** | Ferenz 12.6 (catalog + checkout), James 13.2/13.3 UI |
| **Partial (6)** | Ferenz 12.5 (built, Tower gate absent), 12.9 (tests for what exists), 12.12 (provisioning yes, suspension no), 12.14 (bypass + audit primitive tested; provisioning/suspension not), 12.17 (mechanism live, gate and flag absent), James 15.1 (1 of 4), 17.1 (0 of 4 named capabilities, shell present) |
| **Missing (12)** | Ferenz 12.1, 12.2, 12.3, 12.4, 12.7, 12.8, 12.10, 12.11, 12.13, 12.15, 12.16, 12.18, 12.19; James 16.1, 13.1, 13.4, 13.5, 14.1 |
| **Unaudited** | "Program Partner 12.1–12.6" as described in the V1 prompt — no such items in either handoff doc; see the top of this report |

| Proposed slot | Items |
|---|---|
| **Wave 1, Stream B (E1)** | Ferenz 12.1–12.4 (email + preference schema) · 17.1's two columns (Table prompt time, Family timezone) in the same migration PR |
| **Wave 1, Stream A (S2)** | MFA enrollment/verification UI — already in S2's scope; flagged because every HQ surface is unusable without it |
| **Wave 4, Stream B (with N1)** | James 17.1's UI half (preferences + Family settings screens) |
| **Wave 7, Stream B (H1, re-cut)** | minimal `platform_staff` inbox view |
| **Wave 9, Stream A (Q3)** | PostHog analytics — no change, already correctly slotted |
| **Backlog** | Ferenz 12.5's Tower gate (blocked on `towers`), 12.7, 12.8, 12.10, 12.11, 12.13, 12.12-suspension, 12.14, 12.15–12.19; James 13.1, 13.4, 13.5, 14.1, 15.1 (full), 16.1 |
| **Needs a decision, not a slot** | findings A–D: the live ungated take rate, dormant-per-Tower, the Family-layer schema, three-vs-four billing tiers |
