# V1 — Repo audit against the prior prompt lists

**Wave 0, Stream B** · **Date:** 2026-08-30 · **Executor:** James Jarin ·
**For review:** Ivan Rattliff, 09:30

Audited: Ferenz's backend items **12.1–12.6** (Program Partner) and
**13.1–13.19** (transactional email, commerce Sessions 13–16, reshaped
analytics, HQ dashboard, three-tier billing), plus old James items
**15.1–17.1** (HQ UI, billing UI, Family settings).

No code was changed. `git diff` for this session shows this file and nothing
else.

---

## Read this first — the source lists are not in the repo

The three numbered lists themselves do not exist in this repository, in any
doc, or anywhere in its git history.

- `grep` for `12.1`, `13.19`, `15.1`, `17.1` across every tracked `.md`:
  the only hits are lines 194–198 of the run doc — the V1 prompt quoting
  its own item numbers.
- `git log --all --name-only` lists no file ever tracked whose name contains
  `prompt`, `handoff`, `ferenz`, `james`, or `partner`, other than
  `F4milia — Complete Run Doc (Prompts Included).md` itself.
- `grep -ril "program_partner"` over `supabase/ app/ lib/ tests/ docs/`:
  zero hits. The term appears twice in the whole repo, both in the run doc.

**Consequence:** item-level numbering cannot be mapped. `12.1–12.6` names six
items; the V1 prompt's own parenthetical names four artifacts
(`program_partners`, `family_program_enrollments`, aggregate endpoints,
privacy floor), so **two of the six are unrecoverable from anything in this
repo**. The same holds inside `13.1–13.19` — nineteen items, five named
areas — and inside `15.1–17.1`.

This report therefore audits **by named capability, not by item number**. If
Ivan needs per-number sign-off, the source lists have to come from Ferenz's
side; the capability verdicts below will not change, but their allocation to
numbers might.

## What was actually executed for this report

Stated per the "never state a verification that was not executed" rule.

| Check | How | Result |
|---|---|---|
| Schema inventory | `grep "create table"` over all 43 migrations | 33 tables, listed below |
| Feature presence | `grep -ril` per keyword over `supabase/ app/ lib/ tests/ docs/` | per row in the tables |
| Route presence | `find app -type f` | 54 files, full list read |
| CI state on `main` | `gh run view 33264519508 --json jobs` at `4e930d4` | `migrations`, `build-and-test`, `isolation` — all **success**, 2026-08-29 |
| Test inventory | `grep -c "it("` over `tests/isolation/*.test.ts` | 89 cases, 16 files |

**Not executed, and not claimed anywhere below:** the suites were *not* run in
this worktree — `node_modules` is absent here and installing it is outside an
audit session's remit. Every "tests passing" claim rests on the green CI run
on `main` above, not on a local run. Nothing was checked against staging or
production; where the session log is the only evidence for a live-API fact, the
row says so.

**Tables that exist today** (the whole schema, for reference): `organizations`,
`profiles`, `org_profiles`, `memberships`, `platform_staff`, `audit_log`,
`webhook_events`, `idempotency_keys`, `invitations`, `cohorts`,
`cohort_members`, `posts`, `comments`, `reactions`, `reports`, `blocks`,
`member_reports`, `member_blocks`, `stages`, `member_stages`,
`stage_transitions`, `mentor_pairings`, `meetups`, `meetup_series`,
`meetup_rsvps`, `meetup_attendance`, `video_assets`, `live_streams`,
`live_stream_credentials`, `connected_accounts`, `products`, `orders`,
`order_items`.

---

## The table

### Group 12 — Program Partner (Ferenz, 12.1–12.6)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| ~12.x | `program_partners` table | **missing** | Not in the 33-table inventory. `grep -ril "program_partner"` over `supabase/ app/ lib/ tests/ docs/` → zero hits. No migration, no type in `lib/supabase/database.types.ts`. |
| ~12.x | `family_program_enrollments` table | **missing** | Not in the inventory. `grep -ril "enrollment"` → two hits, both prose in `docs/session-2-checklist.md` and `docs/session-3-checklist.md`. No table, no code. |
| ~12.x | Aggregate endpoints | **missing** | `app/api/` contains exactly two routes: `webhooks/mux`, `webhooks/stripe`. No RPC in any migration returns partner-scoped aggregates. |
| ~12.x | Privacy floor | **missing, and unspecified** | `grep -i` for `privacy floor`, `k-anon`, `suppress`, `minimum cohort`, `aggregate` over `docs/*.md` → zero hits. No doc in this repo defines what the floor *is* (minimum N? per what unit? applied where?). |
| 12.5, 12.6 | unrecoverable | **unknown** | See "the source lists are not in the repo". |

Nothing partial here — the Program Partner concept has no presence in this
codebase at all, not even a doc that defines it.

### Group 13 — 13.1–13.19

| Area | Verdict | Evidence |
|---|---|---|
| Transactional email | **missing** | No mail provider in `package.json` (no `resend`, no `postmark`, no `nodemailer`). `grep -ril "resend\|sendEmail\|email_template"` over `app/ lib/ components/ supabase/ tests/` → zero hits. `.env.example` reserves `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` under a `# --- Transactional email (Session 4) ---` heading; nothing reads either. `supabase/config.toml` leaves `[auth.email.smtp]` commented out, so auth mail is Supabase's built-in mailer on default templates — no custom sending domain, no SPF/DKIM. |
| Per-Family notification preferences | **missing** | No table in the inventory. `grep -ril "notification"` over `supabase/ app/ lib/ tests/` → one hit, `supabase/config.toml`. |
| Invite delivery | **missing** (mechanism **done**) | `invitations` table + `app/actions/invitations.ts` + `/o/[slug]/settings/members` exist and are isolation-tested (5 cases). `docs/session-3-checklist.md`: *"Actual email delivery for invitations… Session 4 adds the transactional email that would send the invite link automatically."* Today an invitee finds out because someone tells them. |
| Commerce S13 — Connect onboarding | **done** | Migrations `20260831100101_connected_accounts.sql` + `_rls`; `app/actions/commerce.ts` (`startStripeOnboarding`); `account.updated` handled in `app/api/webhooks/stripe/route.ts`; UI at `/o/[slug]/settings/commerce`, `org_owner`-gated; `tests/isolation/connected-accounts.test.ts`, 4 cases, green in CI. Live-API verification is recorded in `docs/SESSION-LOG.md` (real accounts, real connect-scoped production webhook delivery) — session log, not re-verified here. **Open item from that log, unverifiable from the repo:** the old non-Connect-scoped Stripe endpoint is still registered in the Stripe dashboard. |
| Commerce S14 — catalog + checkout | **done** | Migrations `20260901110101_products_and_orders.sql` + `_rls` (`product_type` ∈ digital/physical/ticket/cohort_seat; `order_status` ∈ pending/paid/canceled/refunded); `app/actions/checkout.ts`, `products.ts`; UI `/o/[slug]/shop`, `/settings/products`; idempotency via `lib/idempotency.ts`; rate limit 5/60s in `lib/commerce.ts`; `tests/isolation/products-and-orders.test.ts`, 8 cases, green in CI. |
| Commerce S15 — fulfillment, entitlements, refunds | **missing** | `refunded` exists as an enum value only: `grep -rn "refund"` over `app/ lib/` returns two hits, both in generated `database.types.ts`. No code writes that status, no Stripe refund call, no application-fee reversal. No entitlement grant on a `cohort_seat` purchase, no digital delivery, no address capture. `docs/session-14-checklist.md` says so itself: *"a `cohort_seat` purchase doesn't actually enroll anyone yet, digital products have nothing to deliver (Session 15)."* |
| Commerce S16 — benefits marketplace | **missing** | `grep -ril "vendor"` over `supabase/ app/ lib/ tests/` → zero hits. No `offers` table, no `our_compensation` disclosure surface, no redemption tracking. |
| Reshaped analytics | **missing** | No `posthog` in `package.json`; `grep -ril "posthog"` over `app/ lib/ components/ tests/ instrumentation*.ts` → zero hits. `instrumentation-client.ts` is Sentry only. No scrubbing test in `tests/`. The four numbers named in `docs/revenue-model-and-mentor-compensation.md` §4 (GMV, blended take rate, NRR, top-10 concentration) are instrumented nowhere. Invariant 4 is **not** currently violated — zero events ship, so the scrubbing test still precedes the first event, exactly as required. |
| HQ dashboard (build-plan Sessions 18–19) | **partial — thin** | *Present:* `app/admin/organizations/new/page.tsx` (provisioning, `requirePlatformAdmin`), `am_i_platform_admin` RPC, the `platform_admin` RLS bypass clause, `tests/isolation/platform-admin.test.ts` (6 cases) and `role-escalation.test.ts` (3), green in CI. *Missing:* cross-tenant org list and health metrics, org suspension, audited impersonation, revenue ops (GMV by org, fee revenue, payout state, refunds/disputes, stuck onboarding), and any staff-facing inbox. `find app -path "*admin*"` returns exactly one file. |
| Three-tier billing | **missing — and the spec conflicts** | No plans table, no org plan assignment, no seat/usage limits, no dunning, no invoices. What exists is a single constant: `PLATFORM_TAKE_RATE = 0.2` in `lib/commerce.ts`, feeding `applicationFeeAmount()` into `payment_intent_data.application_fee_amount` at `app/actions/checkout.ts:117`. Its own comment says tier assignment is Session 19's job. **Conflict for Ivan:** the V1 prompt says "three-tier"; the only billing spec in this repo (`docs/revenue-model-and-mentor-compensation.md` §1) is **four** rungs — Free 20% / Growth 10% / Scale 6% / Owned 4%. Someone has to say which is authoritative before this is built. |

### Group 15.1–17.1 — old James items

| Area | Verdict | Evidence |
|---|---|---|
| HQ UI | **partial — thin** | Same evidence as the HQ dashboard row above: one provisioning page, correct platform-admin gating, nothing else. Compounding gap disclosed in `docs/session-3-checklist.md`: there is **no MFA enrollment/verification UI**, so a real `platform_staff` account cannot complete its challenge through this app at all — it has to be driven via the Supabase client API directly. Any HQ surface is unreachable in practice until that ships (S2 owns it). |
| Billing UI | **partial — org side only** | `/o/[slug]/settings/commerce` exists, `org_owner`-scoped (not organizer), and renders Connect state `not_started` / `incomplete` / `active` from `connected_accounts`. Nothing else: no platform-side billing UI, no plan picker, no invoice or receipt surface. **Flag:** the 20% application fee is charged on every real Checkout Session and is displayed to the tenant nowhere in the UI — `grep` for `fee`/`take rate` across `shop/page.tsx` and `checkout.ts` finds only the server-side call and its comment. Given §3.3/§3.4 of the revenue doc, disclosure is worth a decision, not a default. |
| Family settings | **partial** | *Present:* eleven per-surface settings pages (`members`, `cohorts`, `stages`, `mentorship`, `meetups`, `videos`, `live`, `products`, `reports`, `member-reports`, `commerce`), role-gated through `lib/org-nav.ts` with page-level enforcement. *Missing:* no settings index route; no Family profile/branding editing — `organizations.settings` (jsonb, Session 1) exists and `grep` finds nothing that ever writes it, which `docs/session-3-checklist.md` states outright; **no Family-level timezone** (`profiles.timezone` is per-user; `meetups`/`meetup_series` each carry their own); no Family Night / daily Table prompt time; no per-Family notification preferences; the 12-member cap is enforced in `lib/family-cap.ts` and surfaced nowhere. |

---

## Dependencies — what later waves actually assume

Method: `grep` over every session prompt in `F4milia — Complete Run Doc
(Prompts Included).md` for each missing capability's terms, then read the
matching prompt's acceptance criteria. Conclusions below cite prompt text, not
inference.

### Upstream — a later wave assumes this and will stall or invent without it

**1. Transactional email + per-Family preference schema (E1).**
The wave table says *"E1 gates all notification work"*, and Wave 1 Stream B is
already written as conditional: *"run only if V1 shows it missing"*. **This
audit shows it missing.** Consumers, by their own prompt text:
- C2 (Wave 3 A): *"@mentions with notification records (delivery UI arrives in N1 — write the rows now)"*
- D2 (Wave 3 B): *"Reminder toggles per item write preference rows (delivery arrives in N1)"*
- N1 (Wave 4 A): *"Consumes E1's preference schema"*
- Q2 (Wave 9 A): rate limiting on email

→ **Slot: Wave 1, Stream B, as already written.** Upstream of Wave 3.

**2. Family-level settings: timezone and the Table prompt time.**
Two later acceptance criteria name a Family-level setting that has no column:
- D2 (Wave 3 B): *"Calendar respects the Family's stored timezone"* — there is no Family-stored timezone.
- N1 (Wave 4 A): *"The daily Table prompt push fires at the Family's chosen time in the Family's timezone"* — neither value exists.

→ **Slot: Wave 1, Stream B, in E1's migration PR** (both are small columns on
`organizations` and both belong with the preference schema; per the standing
workflow the migration ships as its own PR). Upstream of Wave 3. If it slips
past Wave 2, D2 will either invent a per-user fallback or hardcode UTC.

**3. A platform_staff-facing view.**
H1 (Wave 7 B) acceptance: *"a submitted form reaches the staff view and writes
an audit row."* No staff view exists — `app/admin` holds one provisioning
page. The MFA gap above means a staff account cannot sign into one today
either.

→ **Cheapest correct slot: re-cut H1's own scope** to include the minimal staff
inbox it needs, rather than opening a new session — the surface is one
`platform_admin`-gated list. That keeps it upstream of nothing else, since no
other session reads it. The MFA enrollment UI stays with **S2 (Wave 1)**, which
already owns 2FA; without it H1's acceptance cannot be demonstrated by a human.

### Already scheduled — missing, but the doc owns it

**4. Reshaped analytics.** Q3 (Wave 9 A) *is* this work: *"PostHog: product
analytics across the app… Write the scrubbing test before the first event
ships."* No earlier session reads analytics data. → **No change. Stays Wave 9.**

### Backlog — nothing in Waves 1–10 depends on it

**5. Program Partner (all of 12.x).** The wave table's own Wave-0 note offers
*"e.g. a Program Partner endpoint N1 or K1 reads"* as a hypothetical. Checked
against the actual prompts: **neither N1 nor K1 mentions partners, enrollments,
aggregates, or a privacy floor**, and `grep -i` for `partner|aggregate|
enrollment|program` across the entire run doc returns only the V1 note and the
V1 prompt itself. No session in Waves 1–10 depends on it.
→ **Backlog**, with two caveats worth a minute at 09:30: (a) it is blocked on a
*spec*, not on build time — the privacy floor is undefined everywhere, and
inventing a floor would be inventing policy; (b) whenever it lands, invariant 5
means the aggregate endpoint goes through RLS, not a service-role query with
filtering above it, and the new tables carry their audit triggers in the same
migration. If a partner pilot has been promised outside this doc, that
commitment — not the wave table — is what should slot it.

**6. Commerce Sessions 15 and 16.** Pre-flight item 1 states the position
explicitly: *"No Stripe globs — commerce stays dormant-per-Tower and nothing in
this doc touches it."* No session in Waves 1–10 references commerce, orders,
products, or Stripe. → **Backlog** relative to this doc.

**7. Three-tier billing.** No session in this doc touches it; invariant 10
blocks activation on legal sign-off. → **Backlog**, blocked on legal *and* on
the three-vs-four-rung reconciliation above.

---

## Three findings outside the three lists that bear on the 09:30 slotting

Reported, not acted on.

**A. The PARKED section's assumption about profit-share billing is wrong.**
The run doc's PARKED section reads: *"Profit-share activation — built (if V1
confirms) but not-for-production until legal sign-off."* **V1 confirms it is
not built.** There is no plan model of any kind — only the hardcoded
`PLATFORM_TAKE_RATE = 0.2`.

**B. That constant is live in the production checkout path.** Per
`docs/SESSION-LOG.md`, a real (test-mode) checkout completed on production
through the real webhook. Every such charge carries a 20% `application_fee_amount`
from a static constant, while `docs/revenue-model-and-mentor-compensation.md`
says the rate *"needs to be a live lookup against the tenant's current rung at
charge time, not a static config value."* Two things follow that are Ivan's
call, not this session's: whether a live take rate on production sits within
invariant 10's "not-for-production until legal sign-off", and whether the fee
must be disclosed in the tenant-facing UI before any non-test money moves.

**C. The Family layer has no schema at all.** This audit's three lists don't
cover it, but it dominates the slotting question. There is no `towers`,
`bricks`, `vows`, Table-entry, `contribution_ledger`, `conversations`,
`messages`, `notifications`, or Keepsake table — the schema is Trib4l's
org/cohort/posts model. Sessions whose acceptance criteria name those objects
directly: D1 and D2 (Waves 2–3, *"Tower progress… claimed Bricks… current Vow
holder"*), C1 and C2 (Waves 2–3, `conversations`/`messages`), N1 (Wave 4), F1
and F2 (Wave 5, *"Bricks and Ledger events"*), A2/A3/A4 (Wave 6), A5 (Wave 7,
`contribution_ledger`), K1 (Wave 8). Wave 2's D1 is described as *"Read-only UI
over existing tables — no migrations in this session"*, and the tables it reads
do not exist. This is the item most likely to force the wave table to be re-cut
rather than merely appended to, and it is the one thing on this page that
cannot be resolved by slotting a session — it needs a decision about what the
Family layer's schema is.

---

## Summary

| Verdict | Items |
|---|---|
| **Done** | Commerce S13 (Connect onboarding), Commerce S14 (catalog + checkout) |
| **Partial** | HQ UI / HQ dashboard, Billing UI, Family settings |
| **Missing** | All of Program Partner 12.x, transactional email, per-Family notification preferences, invite delivery, Commerce S15, Commerce S16, reshaped analytics, three-tier billing |
| **Unknown** | 12.5–12.6 and the unnamed remainder of 13.x / 15.x–17.x — source lists absent |

| Slot | Items |
|---|---|
| **Wave 1, Stream B (E1)** | transactional email, per-Family preferences, invite delivery, Family timezone + Table-prompt-time columns |
| **Wave 1, Stream A (S2)** | MFA enrollment/verification UI (already in scope; flagged because HQ depends on it) |
| **Wave 7, Stream B (H1, re-cut)** | minimal platform_staff inbox view |
| **Wave 9, Stream A (Q3)** | reshaped analytics — no change, already owned |
| **Backlog** | Program Partner 12.x (blocked on spec), Commerce S15, Commerce S16, three-tier billing (blocked on legal + rung count) |
| **Needs a decision, not a slot** | the Family-layer schema (finding C), the take-rate constant on production (finding B) |
