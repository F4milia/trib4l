# Stream A — blockers

Everything that would halt a Stream A session, session by session, in wave order.

| | |
|---|---|
| **Written** | 2026-09-02 |
| **Against** | `F4milia — Complete Run Doc (Prompts Included).md`, Stream A column |
| **Repo state** | `origin/main` @ `8ed81dc` (after `#91`) |
| **Scope** | Waves 3–10. Waves 0–2 (S1, S2, C1) are merged |
| **Method** | Every claim below was checked against the repo. Commands in §10 |

---

## 1. How to read this

| | Meaning |
|---|---|
| 🔴 **HARD** | The session cannot meet its stated acceptance criteria. Something outside its own scope has to exist first |
| 🟠 **DECISION** | Yours. Proceeding without it means inventing product, which CLAUDE.md rules out |
| 🔑 **SECRET** | An account, key or plan that has to exist before the session can run |
| 🟡 **SCOPE** | Buildable inside the session, but the prompt does not say so. These are the estimate-killers, not the stoppers |
| 🔵 **CARRIED** | A known defect from a merged session that lands on this one |

**The short version.** Two sessions cannot run as written: **A5** has no equity table and no
column to hold what it produces, and **F2** needs AI infrastructure a full wave before
**A1** builds it. Everything else is a decision, a dependency to install, or a scope surprise.

## 2. Summary

| Wave | Session | Hardest blocker | Unblocked by |
|---|---|---|---|
| 3 | **C2** | 🟠 storage quota numbers · 🟡 must build the `notifications` table nobody scheduled | You, ~5 min |
| 4 | **N1** | 🔴 web push needs the PWA that **W2 builds in the same wave, in the other stream** · 🔑 Inngest + VAPID | Sequencing + accounts |
| 5 | **F1** | 🟠 the doc's search list omits `table_entries`, the product's daily content · 🟡 three tables need a `search_vector` | You, ~5 min |
| 5 | **F2** | 🔴 **needs A1's Edge Function + model key, which is Wave 6** · 🟡 `vector` extension not enabled | Re-cut the wave table |
| 6 | **A1** | 🔴 **invariant 12 is unmet and it is dated "before A1"** · 🟠 no model provider chosen · 🔑 API key | You + one PR |
| 6 | **A2** | inherits A1 | — |
| 7 | **A5** | 🔴 **`contribution_ledger` does not exist** · 🔴 `bricks` has no estimate column · 🟠 the slice formula is unspecified | A scheduled schema session |
| 8 | **K1** | 🔴 depends on A5's ledger · 🔑 `@react-pdf/renderer` not installed · 🟡 no completed Tower in seed | A5 first |
| 9 | **Q2** | 🔵 carried rate-limit debt | — |
| 9 | **Q3** | 🔑 PostHog not installed, no project | Account |
| 10 | **R1** | 🔑 hobby plan, one Vercel project doing both preview and production | Plan + project split |

---

## 3. Wave 3 — C2 (next up)

Full plan in `docs/f4milia/c2-pr-plan.md`. Blockers only here.

**🟠 DECISION — storage quota.** Three numbers, none specified anywhere:
per-file cap, per-Family quota, and whether a soft-deleted message's attachment
still counts. C2's acceptance is *"quota exceeded fails with a plain message"*,
which cannot be built without them. Proposed defaults sit in the plan's §6.4
(10 MB / 1 GB / yes, they still count) — **say no and they change**; silence
means they ship.

**🟠 DECISION — reactions table.** A legacy `reactions` table exists from Trib4l,
keyed on `profile_id` with `check ((post_id is null) <> (comment_id is null))`.
Everything in C1 is keyed on `membership_id` deliberately. Recommendation: a
separate `message_reactions`. Cheap to reverse now, expensive later.

**🟡 SCOPE — C2 has to build a table nobody scheduled.** Its acceptance is
*"a mention writes a notification row"*, and **there is no `notifications`
table** — verified absent on `main`. The run doc creates it in no session. C2's
prompt does not forbid migrations, so it is buildable, but it is four new tables
rather than the "mentions and media" the prompt implies.

**🟡 SCOPE — the `'mention'` enum value.** `notification_type` has exactly two
values, and E1's migration comment explicitly reserves the extension for N1.
C2 needs it one wave earlier.

**Not a blocker, but do it first:** whether `private: true` routes
`postgres_changes` through `realtime.messages` RLS is **reasoned, not measured**.
It decides whether the policy needs one clause or two, and getting it wrong
breaks C1's live message stream. It cannot be measured in the schema sandbox (no
Realtime). Ninety seconds against the shared stack.

## 4. Wave 4 — N1

**🔴 HARD — web push has no PWA to install into.** N1's acceptance is *"push
arrives on a locked phone in staging."* Web push requires a service worker and a
manifest. **Neither exists on `main`** — the only thing in `public/` and `app/`
matching is `favicon.ico`. The PWA shell is **W2's**, which the wave table puts in
**the same wave, in Stream B**. The table's own note for Wave 4 says only *"N1
consumes E1"* and never mentions this.

> **Needs a call:** either W2 ships its PWA shell before N1's push work starts,
> or N1 builds a minimal service worker and W2 adopts it. Two sessions writing
> a service worker in the same wave is the collision.

**🔑 SECRET — VAPID keys** for Web Push, or a push provider. Nothing configured.

**🔑 DEPENDENCY — Inngest is not installed.** No `inngest` in `package.json`, no
references in `app/` or `lib/`. N1's prompt: *"Calendar reminders from D2's
toggles delivered through this center via Inngest."* CLAUDE.md's stack names it.
Account, keys, and install all outstanding.

**🔵 CARRIED from C1 — two, and both bite exactly here.** From
`c1-conversations-and-realtime.md` §7:
- `unread_message_counts()` **takes no org argument**, so one call spans both of
  a dual-Family member's Families. Any surface that sums it produces a
  cross-Family number. The record says *"revisit before unread counts drive
  notifications"* — that is this session.
- The read mark is a **timestamp high-water**, so a message committing after the
  mark with an earlier `created_at` counts as read unseen.

**Depends on C2** for the `notifications` table.

## 5. Wave 5 — F1, then F2

**🟠 DECISION — what does search actually cover?** The prompt says *"posts,
comments, Bricks, and Ledger events."* That list **omits `table_entries`** — the
Table is the product's daily habit and its primary content. This is not an
oversight I am inferring: Stream B's own migration says so in a comment —

> *"F1's keyword search and F3's results UI will read two content tables."*

`posts` and `comments` are live Trib4l-inherited tables (used by
`app/actions/posts.ts` and the org page), so they are not dead. **Is search
over Family content, over legacy posts, or both?** The answer changes F1's shape
and F3's grouping.

**🟡 SCOPE — F1 is a migration session, not a read-only one.** Only `posts` and
`comments` carry a `search_vector`. `table_entries`, `bricks` and `ledger_events`
have none. F1 must add columns, triggers and GIN indexes to three tables.

**🟡 SCOPE — `ledger_events` is not searchable in its current shape.** Its only
content column is `payload jsonb`, with no text column and no vector. *"Search
Ledger events"* needs a decision about which payload keys are searchable before
an index can exist.

**Worth knowing: `ledger_events` has no writer.** Nothing in `app/` or `lib/`
inserts into it — only the seed. Searching it returns seeded rows and nothing
else until some session writes it, and **no session in the run doc does.**

**🔴 HARD — F2 needs AI infrastructure that Wave 6 builds.** F2's prompt: *"embed
Table entries, posts, and Bricks on write via Edge Function."* That needs an
Edge Function, a model provider and an API key — which is **A1's entire job, one
wave later**. Verified: `supabase/functions/` **does not exist**; there is not a
single Edge Function in the repo.

> **The wave table has these backwards.** Either A1 moves ahead of F2, or F2
> moves after Wave 6, or F2 builds throwaway AI plumbing that A1 then replaces —
> which is exactly the "if A1's isolation is subtly wrong, it is wrong in six
> sessions" risk the A1 gate exists to prevent.

**🟡 SCOPE — the `vector` extension is not enabled.** The only extension any
migration creates is `pgcrypto`.

## 6. Wave 6 — A1, then A2

**🔴 HARD — invariant 12 is unmet, and it is explicitly dated to before this
session.** CLAUDE.md: *"This is settled BEFORE the first AI session (Wave 6 /
A1), not after."* On `main` today:

- the **production Sentry DSN is hardcoded** in all three configs
  (`sentry.edge.config.ts`, `sentry.server.config.ts`, `instrumentation-client.ts`)
- `dataCollection` is present but **every option is commented out**, so it
  inherits the permissive defaults — `userInfo`, `httpBodies`, **and genAI
  inputs/outputs, all ON**

The third is the one that matters here: the first AI session would ship prompts
and suggestions to a third party, from CI and staging as well as production, and
pass every other gate. **One small PR, owed before A1.**

**🟠 DECISION — which model provider and model.** Specified nowhere. CLAUDE.md's
stack says only *"Edge Functions for all AI calls."* Needed before A1 can start.

**🔑 SECRET — the model API key**, server-side only. Invariant 2: it must never
reach the client bundle, and A1's acceptance greps the build output for it.

**🟠 DECISION — the AI cost ceiling.** Invariant 7 requires rate limits on
anything that costs money. A1 is the first such endpoint; Q2 (Wave 9) is four
waves later.

**🔵 CARRIED — 16 `SECURITY DEFINER` functions pin `search_path = public`**,
leaving `pg_temp` implicitly first — including `is_org_member()` and
`has_org_role()`, which **every C1 policy calls**. C1's record calls it *"owed as
its own migration."* Latent today, but A1's whole gate is that its context
assembler cannot reach another Family, and it reaches through these functions.

**Gate:** A1 merges only at 09:30 with Ivan present. A2 does not.

## 7. Wave 7 — A5 (the worst one)

**🔴 HARD — `contribution_ledger` does not exist.** Not in any of the 75
migrations. It appears only in `docs/v1-repo-audit.md` and
`docs/f4milia/d1-readiness.md`, both of which flag it as missing.

A5's acceptance criterion is:

> *"grep proves no AI code path writes to `contribution_ledger` numeric columns"*

**That grep passes today, vacuously, because the table does not exist.** A green
acceptance criterion that proves nothing is the exact failure mode CLAUDE.md's
§6 lessons are about.

The run doc schedules **no session that builds the Contribution & Equity Engine**,
while CLAUDE.md's opening paragraph describes it as core and invariant 1 is
entirely about it. `d1-readiness.md` §1 spotted this and deferred it — *"noted so
it is not discovered in Wave 7."* This is Wave 7.

**🔴 HARD — `bricks` has no estimate column.** A5's first deliverable is
*"suggested effort estimates at Brick creation — the Family confirms or edits;
only the confirmed number enters the ledger."* The table has `description`,
`due_at`, `status`, `assignee`, `verified_by`, `verified_at` — and **nowhere to
put an estimate, confirmed or suggested**.

**🟠 DECISION — the slice formula itself.** Invariant 1 says it is deterministic
and untouchable, but the actual formula — hours, multipliers, which Slicing-Pie
variant, what a non-cash contribution is worth — is specified nowhere I can find.
It is the one thing on this project that cannot be inferred from the code,
because the code does not exist.

**Gate:** merges at 09:30 with Ivan present, no exceptions.

> **This needs a scheduled session, not a fix.** It is the largest structural gap
> in the run doc's Stream A column, and it is three waves out.

## 8. Wave 8 — K1

**🔴 HARD — depends on A5's ledger.** K1's acceptance: *"The Contribution Report
PDF's numbers match the deterministic ledger."* No ledger, no report.

**🔑 DEPENDENCY — `@react-pdf/renderer` is not installed.** CLAUDE.md's stack
names it; `package.json` does not have it.

**🟡 SCOPE — no completed Tower in the seed.** `tower_status` has a `'complete'`
value; both seeded Towers are `'active'`. There *is* a completed Build with
peer-verified `done` Bricks, so the Brick layer is covered. K1's prompt allows
extending the seed — but `supabase/seed.sql` is **Stream B's surface**, so this
is a cross-stream touch that needs coordinating rather than assuming.

**Its named edge case needs seed too:** *"a Tower whose contributor left
mid-Build"* requires a departed member with historical Bricks.

## 9. Waves 9–10 — Q2, Q3, R1

**Q2 — 🔵 carried debt, no hard blocker.** Two items already recorded as owed
here: C1's *"no rate limit on sending"* a message (it will cost money once N1
turns messages into pushes and emails), and `app/actions/support.ts`'s
check-then-insert rate-limit race from `d1-readiness.md` §4.

**Q3 — 🔑 PostHog is not installed** and there is no project. No `posthog` in
`package.json` and no references in `app/` or `lib/`. Also 🟠 **cloud or
self-hosted** — invariant 4 is strict about what may leave the building, and
that choice determines where event payloads land.

**R1 — 🔑 the plan and the project shape.**
- The team is on the **hobby** plan. Preview builds already exhausted its quota
  once (`b3204cc`), which is why deploys were off until `#91`. R1 adds
  *"one-command deploy from main, gated on green CI"* on top of restored
  previews.
- **One Vercel project, `f4milia_production`, currently serves both** preview and
  production. R1 wants *"staging and production differ only where the X1 README
  already says they do"* — that needs two environments to differ.

**Not a blocker, better than expected:** R1's *"grep for undecided migrations
returns zero"* is already satisfied — **all 75 migrations carry a `-- Reverse:`
header.** What is missing is that none has been *executed*; R1's rollback drill
is real work, but it starts from documented down-paths rather than from nothing.

---

## 10. Decisions I need from you, collected

Ordered by when they block. The first two are this week.

| # | Decision | Blocks | Default if you say nothing |
|---|---|---|---|
| 1 | Storage per-file cap, per-Family quota, and whether soft-deleted attachments count | **C2, now** | 10 MB / 1 GB / yes — ships as written |
| 2 | `message_reactions` as its own table, not the legacy `reactions` | **C2, now** | Ships as its own table |
| 3 | Does search cover `table_entries`? Legacy `posts`/`comments` too? | **F1, Wave 5** | — I will not guess this one |
| 4 | Model provider and model, plus the API key | **A1, Wave 6** | — |
| 5 | AI cost ceiling / rate limit | **A1, Wave 6** | — |
| 6 | **The slice formula.** Hours, multipliers, the Slicing-Pie variant | **A5, Wave 7** | — |
| 7 | PostHog cloud or self-hosted | **Q3, Wave 9** | — |
| 8 | Vercel plan, and whether staging gets its own project | **R1, Wave 10** | — |

## 11. Sequencing problems, which no decision fixes

Three places where the wave table's own ordering is the blocker.

1. **F2 (Wave 5) needs A1 (Wave 6).** Semantic search cannot embed anything
   without the Edge Function and model key A1 establishes. Move A1 earlier, move
   F2 later, or accept throwaway plumbing in the one area the run doc gates
   precisely because it must be built once, correctly.
2. **N1 (Wave 4) needs W2 (Wave 4, other stream).** Web push needs a service
   worker; the PWA shell is W2's. Same wave, parallel streams, and the wave
   table's note does not mention it.
3. **No session builds the equity engine**, yet A5 (Wave 7) assists it and K1
   (Wave 8) reports on it. Slot a schema session upstream of Wave 7 — the wave
   table's own Wave 0 note describes exactly this remedy: *"a gap that a Wave 4+
   session silently assumes gets slotted upstream of that wave, or the wave
   table gets re-cut."*

## 12. What is *not* a blocker

Stated so nobody re-investigates these.

- **The domain model.** `towers`, `builds`, `bricks`, `table_entries`,
  `table_prompts`, `vows`, `mood_tags`, `ledger_events` and the streak functions
  are all on `main` (Stream B, `#80`/`#85`/`#86`/`#88`). D1's old blocker list is
  closed.
- **Migration rollback decisions.** All 75 have a `-- Reverse:` header.
- **Email.** `lib/email/` is built with templates, per-Family preferences,
  transport and rate limiting. N1 extends it rather than starting it.
- **Preview deploys.** Restored in `#91` and proven — a Preview went Ready in 59s
  with a live URL on the PR.
- **Storage being empty.** C2 owns it; greenfield is the expected state, not a
  blocker.
- **The shared local stack.** `scripts/schema-sandbox.sh` (`#79`) runs migrations
  and pgTAP in their own container. It does *not* cover isolation, realtime or
  browser tests — CI does.

## 13. How this was verified

Every claim above came from one of these, run against `origin/main` @ `8ed81dc`:

```bash
# tables that exist
git grep -hoiE "create table (if not exists )?(public\.)?[a-z_]+" origin/main -- supabase/migrations

# dependencies
git show origin/main:package.json

# Edge Functions, extensions, storage
git ls-tree -r --name-only origin/main supabase/functions          # empty
git grep -hoiE "create extension (if not exists )?[\"a-z_]+" origin/main -- supabase/migrations
git grep -ln "storage\." origin/main -- supabase/migrations        # empty

# PWA, Inngest, PostHog
git ls-tree -r --name-only origin/main -- public app | grep -iE "manifest|sw\.|service-worker"
git grep -ril "inngest" origin/main -- app lib package.json        # empty
git grep -ril "posthog" origin/main -- app lib                     # empty

# rollback decisions
grep -rLi "^-- Reverse:" supabase/migrations/*.sql | wc -l         # 0

# search coverage
grep -rlE "search_vector" supabase/migrations/*.sql                # 2 files only

# invariant 12
grep -rn "dsn" sentry*.ts instrumentation-client.ts
grep -n -A6 "dataCollection" sentry.server.config.ts               # all commented out
```

Two things I did **not** verify and am flagging as such: whether the Supabase
plan in use supports `pgvector` on the hosted side (local is a migration away),
and whether a spec document outside this repo already fixes the slice formula.
Both are questions for you rather than checks I can run.
