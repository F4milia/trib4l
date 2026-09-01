# Stream B — blockers

What stops each Stream B session. Waves 3–9.

| | |
|---|---|
| **Written** | 2026-09-02 |
| **Against** | `F4milia — Complete Run Doc`, Stream B column |
| **Repo state** | `origin/main` @ `6d544e7` |
| **Method** | Checked against the repo. Commands in §10 |

Waves 0–2 (V1, E1, D1) are done or in flight.

---

## 1. Key

| | |
|---|---|
| 🔴 **HARD** | Cannot meet its acceptance criteria. Needs something outside its scope |
| 🟠 **DECISION** | Yours |
| 🔑 **SECRET** | An account, key or environment that must exist first |
| 🟡 **SCOPE** | Buildable in-session, but the prompt does not say so |
| 🔵 **CARRIED** | Known defect landing on this session |

## 2. Summary

| Wave | Session | Hardest blocker |
|---|---|---|
| 3 | **D2** | 🔴 Three things it displays are not stored: Family Night schedule, Vow rotation order, per-item reminders |
| 4 | **W2** | 🔴 Service worker collides with N1, same wave, other stream |
| 5 | **F3** | 🔴 Blocked by F1, which is blocked by your search-scope decision |
| 5 | **M1** | 🔴 Must reuse C2's per-Family quota, or it doubles the storage budget past the 1 GB plan |
| 6 | **A3** | 🔴 Blocked by A1 · 🟠 "convener" is not a role that exists |
| 6 | **A4** | 🔴 **Member Card does not exist** — no table, no UI, nothing |
| 7 | **O1** | 🔴 Blocked by A1 · 🔴 **no Tower definition form exists, and no session builds one** |
| 7 | **H1** | ✅ Looks already built. Verify before scheduling |
| 8 | **K2** | 🔴 `towers` has no publish state |
| 8 | **Q1** | ✅ Mostly clear — the Terracotta flag is already resolved |
| 9 | **Q4** | 🔑 ZeroStep has no token and is unused · 🔴 no staging exists |

---

## 3. Wave 3 — D2 (next up)

The prompt says *"Pure UI over existing tables."* Three of the things it displays are not in any table.

**🔴 No Family Night schedule.** `organizations` has `table_prompt_time` and `timezone`. Those are the **daily Table prompt**, not Family Night. D2's calendar shows "Family Night schedule". Nothing stores a day or time for it.

**🔴 No Vow rotation order.** `vows` has `holder_id`, `commitment`, `status`, `assigned_at`. Nothing says whose turn is next. D2's calendar shows "Vow rotation turns".

**🔴 Reminder toggles have nowhere to go.** `notification_preferences` is keyed `(org_id, profile_id, notification_type, channel)`. D2 wants a toggle **per item** — this Brick, this calendar entry. That key cannot hold it. Needs a new table or a new dimension.

**🟡 So D2 is a migration session.** All three above are schema. The prompt says otherwise. Same problem D1 hit.

**Not blocked:** `bricks` and `bricks.due_at` exist. `organizations.timezone` exists, so "calendar respects the Family's stored timezone" is satisfiable. D2's named edge case — Bricks revert to open when a member leaves — is already built in `20260903100911_brick_release_on_departure.sql`.

## 4. Wave 4 — W2

**🔴 Service worker collision with N1.** W2 builds the PWA shell. N1 (Stream A, **same wave**) needs a service worker for web push. Neither exists today. Two sessions writing one in parallel is the collision. The wave table does not mention it.

Decide: W2 ships the shell first and N1 extends it, or N1 ships a minimal worker and W2 adopts it.

**🟠 Where is signup consent recorded?** W2's acceptance is *"signup blocks without consent checkboxes."* No consent column exists anywhere. If consent must be auditable, it needs a column and a migration. If it is a client-side gate only, say so — but then it is not provable later.

**Not blocked:** no onboarding route exists, so first-run is greenfield. `invitations` exists. ToS/Privacy placeholder copy is settled by invariant 11 — `[PENDING LEGAL REVIEW]`, no invented terms.

## 5. Wave 5 — F3, then M1

**F3 — 🔴 blocked by F1**, which is blocked by a decision you have not made: does search cover `table_entries`? F3 groups results by *"posts, Bricks, Ledger, members"* — the same list, with the same omission. See `stream-a-blockers.md` §5.

F3 cannot start before F1 merges. That is in its own prompt.

**M1 — 🔴 depends on C2's storage shipping first.**

**M1 — 🔴 the storage budget is the real constraint.** The plan is Supabase Free: **1 GB total**. C2 sets a per-Family quota of 100 MB across 8 Families = 800 MB. M1's prompt says *"reusing Wave 3's storage policy pattern, same quotas, same caps."*

> **M1 must share C2's per-Family quota, not get its own.** A second 100 MB per Family takes the budget to 1600 MB and blows the plan before Wave 6. C2 is building the quota as "this Family's total across the attachment buckets" for exactly this reason. M1 inherits it — it does not add to it.

See `production-constraints.md` §3.

## 6. Wave 6 — A3, then A4

**Both are 🔴 blocked by A1** (Stream A, Wave 6), and their prompt says *"launch after A1 merges."* A1 is itself blocked — no Edge Functions exist, no model provider chosen, no API key, and invariant 12 is unmet. See `stream-a-blockers.md` §6.

**A3 — 🟠 "convener" is not a role.** `membership_role` is `member`, `mentor`, `organizer`, `org_owner`. A3's acceptance is *"the draft renders only to the convener."* Is the convener the `organizer`? A per-Family rotating position? Someone else? Undefined.

**A4 — 🔴 the Member Card does not exist.** No table, no UI, no reference anywhere in `supabase/` or `app/`. A4's whole job is to *"suggest an updated Member Card line."* The thing being updated has not been built, and no session in the run doc builds it.

## 7. Wave 7 — O1, then H1

**O1 — 🔴 blocked by A1**, same as A3/A4.

**O1 — 🔴 there is no Tower definition form.** Its acceptance is *"the guide cannot write a Tower directly — it prefills the definition form the member submits."*

`towers` exists as a table, but **nothing in `app/` or `lib/` reads or writes it.** There is no Tower creation UI and no write path. No session in the run doc builds one — D1 displays Tower progress read-only, and A2 assumes a Tower description already exists.

> Same class of gap as `contribution_ledger`: a thing several sessions consume that no session creates. Slot it upstream of Wave 6.

**H1 — ✅ appears already built.** `app/help/page.tsx`, `app/admin/support/page.tsx`, `app/actions/support.ts`, `lib/support.test.ts` and the `support_requests` table all exist. Verify against H1's acceptance before scheduling it; it may be a no-op.

**🔵 Carried:** `app/actions/support.ts` has a check-then-insert rate-limit race, recorded in `d1-readiness.md` §4 and still open. It belongs to whoever touches H1 next, or Q2.

## 8. Wave 8 — K2, then Q1

**K2 — 🔴 `towers` has no publish state.** `tower_status` is `active`, `stalled`, `pivoted`, `complete`. Nothing represents published or unpublished. K2 needs publish, unpublish, *"unpublished Towers 404 publicly"*, and an audit row for each. That is a migration plus a public route.

**K2 — 🟠 what does "what the Family approved" mean?** The prompt says published pages show approved content. There is no approval step anywhere in the product. Is publishing itself the approval, or is there a separate step?

**Q1 — ✅ the headline item is already done.** The Terracotta-on-Parchment primary button measures **4.70:1** and the value is recorded in `f4milia-design-system.md`. Q1's prompt calls it *"a known open flag"*; it is closed.

Remaining Q1 work is real but unblocked: keyboard navigation and screen-reader labels on the Table and Brick flows. **One dependency:** Q1's named edge case is *"keyboard-only through a full Table entry WITH a photo attached"*, which needs M1.

## 9. Wave 9 — Q4, the launch gate

**🔑 ZeroStep has no token and has never been used.** `@zerostep/playwright` is in `devDependencies`, but **no spec calls `ai()`** — every existing e2e test is plain Playwright, and there is no `ZEROSTEP_TOKEN` in `playwright.config.ts` or any workflow. Q4's entire premise is *"one ZeroStep suite."* Needs an account and a key.

**🔴 There is no staging.** Q4's acceptance is *"passes green in staging twice consecutively."* No hosted Supabase project is linked, and the CLI on this machine is not logged in. Supabase Free also caps at **2 active projects**, so staging and production is the whole allowance.

**🔴 Q4 depends on nearly every session** — its script runs signup through Keepsake export, including the AI Brick draft and slice accrual. Every gap in `stream-a-blockers.md` lands here too, `contribution_ledger` most of all.

## 10. How this was verified

Run against `origin/main` @ `6d544e7`:

```bash
# roles, Member Card, Tower write path
git grep -h -A8 "create type membership_role" -- supabase/migrations
grep -ril "member.card\|member_card" supabase app lib
git ls-files app | grep -i tower                       # empty
grep -rl "from(\"towers\")" app lib                    # empty

# schedule, vows, publish state
grep -nE "add column" supabase/migrations/20260903100111_organizations_schedule_columns.sql
sed -n '/create table vows/,/^);/p' supabase/migrations/20260903101111_vows.sql
grep -niE "publish|public|share" supabase/migrations/20260903100611_towers.sql

# reminder preference key
grep -n "unique (" supabase/migrations/20260903100211_notification_preferences.sql

# consent, ZeroStep, PWA
grep -riE "consent|terms_accepted|tos_" supabase/migrations/*.sql   # empty
grep -rl "zerostep\|\bai(" tests/e2e/*.ts                            # empty
git ls-files app public | grep -iE "manifest|service-worker"         # empty

# H1 already built
git ls-files app | grep -iE "help|support"
```

Two things I did not verify: whether a ZeroStep account already exists under another login, and whether "convener" is defined in a document outside this repo. Both are questions for you.

## 11. Related

- `docs/f4milia/stream-a-blockers.md` — the other stream, including A1 and `contribution_ledger`
- `docs/f4milia/production-constraints.md` — the 1 GB storage budget M1 shares, and the 2-project cap Q4 hits
- `docs/f4milia/d1-readiness.md` — how D1 hit the same "pure UI over tables that do not exist" problem
