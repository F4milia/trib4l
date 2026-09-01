# Stream A — blockers

Everything that would halt a Stream A session, session by session, in wave order.

| | |
|---|---|
| **Written** | 2026-09-02 |
| **Revised** | 2026-09-02 — decisions 1, 2, 3, 6, 8, 9, 10, 11, 12 ruled on; the Free plan opened 13 and 14, and the Wave 4 pass opened 15. See §10 |
| **Against** | `F4milia — Complete Run Doc (Prompts Included).md`, Stream A column |
| **Repo state** | `origin/main` @ `8ed81dc` (after `#91`) |
| **Scope** | Waves 3–10. Waves 0–2 (S1, S2, C1) are merged |
| **Method** | Every claim below was checked against the repo. Commands in §13 |

---

**Companion documents.** `ai-model-and-cost.md` carries the pricing and usage
model behind decisions 4 and 5. `secrets-and-env.md` records every key James
configures, which store it belongs in, and why invariant 2 decides that.
`stream-a-unblock-plan.md` is the ordered PR plan for the blockers that can be
removed **without** any of the open decisions — including tranche E, which takes
Wave 4 from "cannot start" to "waiting on five values and one C2 table".

## 1. How to read this

| | Meaning |
|---|---|
| 🔴 **HARD** | The session cannot meet its stated acceptance criteria. Something outside its own scope has to exist first |
| 🟠 **DECISION** | Yours. Proceeding without it means inventing product, which CLAUDE.md rules out |
| 🔑 **SECRET** | An account, key or plan that has to exist before the session can run |
| 🟡 **SCOPE** | Buildable inside the session, but the prompt does not say so. These are the estimate-killers, not the stoppers |
| 🔵 **CARRIED** | A known defect from a merged session that lands on this one |
| ✅ **DECIDED** | Was a 🟠 or a sequencing problem; James has ruled. §10 carries the ruling |

**The short version, as of the 2026-09-02 revision.** Both sessions that could not
run as written now have a ruled path: **A5** gets a schema session slotted upstream of
Wave 7, and **F2** keeps Wave 5 and builds the first Edge Function itself under four
conditions (§10). **Six decisions are still open** — the model provider and keys, the
AI cost ceiling, PostHog hosting, how a Family-count cap is enforced, the read
mark's design, and the app icon — the last opened by the ruling that storage sits on Supabase **Free**,
which also adds real scope to C2. Everything else is a dependency to install
or a scope surprise.

## 2. Summary

| Wave | Session | Hardest blocker | Unblocked by |
|---|---|---|---|
| 3 | **C2** | ✅ storage caps, reactions and an 8-Family ceiling ruled · 🔴 **per-Family quotas do not bound the 1 GB total, and nothing anywhere caps Family count** · 🟡 must build the `notifications` table nobody scheduled | Decision 14 |
| 4 | **N1** | ✅ the PWA shell ships as its own PR before the wave · 🔑 Inngest + VAPID still outstanding | Accounts |
| 5 | **F1** | ✅ scope ruled: `table_entries` + `bricks` in, `ledger_events` cut · 🟡 two tables need a `search_vector` | Clear to run |
| 5 | **F2** | ✅ builds the first Edge Function itself, under four conditions (§10) · 🔑 **embedding key + dimension now due here** | Decision 4 |
| 6 | **A1** | 🔴 **invariant 12 unmet — now owed before Wave 5, not Wave 6** · 🟠 no model provider chosen · 🔑 API key | You + one PR |
| 6 | **A2** | inherits A1 | — |
| 7 | **A5** | ✅ slice formula ruled · ✅ a schema session upstream of Wave 7 builds `contribution_ledger` and the estimate columns — **its prompt is unwritten** | Writing that session |
| 8 | **K1** | 🔴 depends on A5's ledger · 🔑 `@react-pdf/renderer` not installed · 🟡 no completed Tower in seed | A5 first |
| 9 | **Q2** | 🔵 carried rate-limit debt | — |
| 9 | **Q3** | 🔑 PostHog not installed, no project | Account |
| 10 | **R1** | ✅ staying on **Hobby** — so no named staging environment, and R1's staging/production difference rides on Preview-vs-Production env vars | Clear to run |

---

## 3. Wave 3 — C2 (next up)

Full plan in `docs/f4milia/c2-pr-plan.md`. Blockers only here.

**✅ DECIDED (2026-09-02) — storage quota, on the Supabase FREE plan.** The
earlier proposal (10 MB / 1 GB) assumed Pro. Free gives **1 GB across the whole
project, not per Family**, which changes the numbers materially:

| | Was (assumed Pro) | **Ruled (Free)** |
|---|---|---|
| Per-file cap | 10 MB | **5 MB** |
| Per-Family quota | 1 GB | **100 MB** |
| Deleting a message | deletes the blob | **deletes the blob**, unchanged |

**5 MB** because on a 1 GB project a single 10 MB attachment is 1% of everything
there is, and 5 MB still covers a phone photo (2–5 MB) or a document. **Set it on
the bucket row as well as in the app**, so the platform enforces it and not only
our code.

**100 MB** budgets ~800 MB usable with headroom held back, because message
attachments are not the only consumer: M1 (Wave 5, Stream B) adds photos on Table
entries and attachments on Bricks — *"reusing Wave 3's storage policy pattern,
same quotas, same caps"* — and K1 (Wave 8) generates PDFs. At 100 MB that is
**8 Families before the project ceiling**. The number is purely a function of
expected concurrent Families:

| Concurrent Families | Per-Family quota |
|---|---|
| ~8 | 100 MB |
| ~16 | 50 MB |
| ~26 | 30 MB |

> **✅ DECIDED (2026-09-02) — 8 concurrent Families.** 100 MB is therefore the
> ruled quota, not a placeholder. But look at what the arithmetic does:
> **8 × 100 MB = 800 MB, exactly the usable budget.** The ceiling invariant holds
> *with equality* — there is no slack in it at all. A ninth Family, or a quota
> nudged to 125 MB, breaks it the day it happens rather than eventually.

**🔴 NEW SCOPE, created by the Free plan — per-Family quotas do not bound the
project total.** Eight Families each sitting comfortably inside their own 100 MB
is exactly 1 GB: the entire plan. The failure is then a Family **under** its own
quota whose upload fails anyway, with a raw Supabase error instead of C2's plain
message — which breaks C2's acceptance criterion (*"quota exceeded fails with a
plain message, not a broken upload"*) in a way the per-Family check structurally
cannot catch. C2 therefore needs **either a project-level check as well, or the
invariant `max_families × per_family_quota ≤ usable budget` enforced somewhere
real** — not merely true by arithmetic today. This problem did not exist on Pro,
and it is the single biggest thing the Free ruling adds to C2's scope.

**🔴 SECOND NEW SCOPE — nothing caps the number of Families.** `max_families = 8`
is now a load-bearing platform constraint, and **it exists nowhere in the system**
— verified: no `max_families`, `family_count` or equivalent in `supabase/migrations`,
`app` or `lib`. The 12-member cap limits people *inside* a Family; nothing limits
how many Families a project holds. So the storage ceiling can be broken by an
`organizations` INSERT rather than by an upload: a ninth Family created through
ordinary signup puts the project over budget before anyone attaches a single file,
and the first symptom is **some other Family's upload failing** — a member who did
nothing wrong, seeing a failure caused by a signup they never saw. That is worse
than the failure mode the per-Family quota was built to prevent.

Enforcing it is product behaviour C2 cannot infer, so it is decision 14.
Recommendation: **a hard cap at Family creation with a plain refusal**, the same
shape as the quota message, reversible by one constant. The alternative —
monitor and alert — leaves the invariant as documentation and lands the failure
on the wrong person.

**✅ DECIDED (2026-09-02) — reactions.** `message_reactions` as its own table,
keyed on `membership_id`. Plan-independent, so Free changes nothing here. Settled
on blast radius: the legacy `reactions` table carries `cohort_id` and
`required_stage_id`, and its policies are created in `posts_rls`, then dropped and
recreated in `content_gating` behind `can_see_gated_content(org_id, cohort_id,
required_stage_id)`. Extending it would mean rewriting stage-gating across three
migrations so that a Family chat reaction is not silently gated by a Trib4l stage
— **a bug that would look like it works.** A new table is one migration reusing
`is_conversation_participant()`.

Two details checked in the migrations while recording this, both of which make the
call sharper than the blast-radius argument alone: `required_stage_id` is added to
`reactions` **by `content_gating` itself**, so the three migrations are
`posts_comments_reactions` → `posts_rls` → `content_gating`; and
`reactions_exactly_one_target` is `check ((post_id is null) <> (comment_id is
null))`, so a message-keyed reaction **cannot satisfy the constraint at all** — the
row is rejected outright until that CHECK is rewritten. A `set_reaction_org_and_
cohort()` trigger also derives `org_id`/`cohort_id` from the post or comment
parent, which a message reaction does not have.

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

> **✅ DECIDED (2026-09-02).** Neither. The PWA shell — manifest, icons, and a
> registered but empty service worker — ships as its own small PR **before** Wave
> 4. W2 builds its UI on top of it; N1 adds only a `push` event handler to a file
> that already exists. Neither session creates it, so neither can collide.

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

**Depends on C2** for the `notifications` table — which is why the unblock plan's
PR 8 specifies what N1 needs from it *before* C2 runs, rather than letting N1
discover a mismatch in Wave 4.

> **Tranche E of `stream-a-unblock-plan.md` covers this session.** After it, N1's
> remaining blockers are five values only you can supply (VAPID pair, subject, two
> Inngest keys) and one table C2 owns. The first carried defect above is fixed by
> PR 13; the second is **decision 15**, because picking wrong is expensive to move
> once a notification center sits on it.

## 5. Wave 5 — F1, then F2

**✅ DECIDED — what search actually covers** (ruling in the blockquote below;
the problem statement is kept because it is why the ruling was needed). The
prompt says *"posts,
comments, Bricks, and Ledger events."* That list **omits `table_entries`** — the
Table is the product's daily habit and its primary content. This is not an
oversight I am inferring: Stream B's own migration says so in a comment —

> *"F1's keyword search and F3's results UI will read two content tables."*

`posts` and `comments` are live Trib4l-inherited tables (used by
`app/actions/posts.ts` and the org page), so they are not dead.

> **✅ DECIDED (2026-09-02).** Both, minus the Ledger. `table_entries` and
> `bricks` gain a `search_vector`; legacy `posts` and `comments` stay in scope;
> **`ledger_events` is cut from F1.** F1 is a two-table migration, not four.

**🟡 SCOPE — F1 is a migration session, not a read-only one.** Only `posts` and
`comments` carry a `search_vector`. F1 must add columns, triggers and GIN indexes
to `table_entries` and `bricks` — two tables, per the decision above.

**✅ RESOLVED — `ledger_events` is out of F1's scope.** Its only content column
is `payload jsonb`, with no text column and no vector, and nothing writes to it
(below), so an index over it would cover seeded rows and nothing else. Cut
deliberately: *"search Ledger events"* is a **knowingly unmet acceptance
criterion**, recorded here rather than forgotten. It returns when a session
writes the Ledger.

**Worth knowing: `ledger_events` has no writer.** Nothing in `app/` or `lib/`
inserts into it — only the seed. Searching it returns seeded rows and nothing
else until some session writes it, and **no session in the run doc does.**

**🔴 HARD — F2 needs AI infrastructure that Wave 6 builds.** F2's prompt: *"embed
Table entries, posts, and Bricks on write via Edge Function."* That needs an
Edge Function, a model provider and an API key — which is **A1's entire job, one
wave later**. Verified: `supabase/functions/` **does not exist**; there is not a
single Edge Function in the repo.

> **✅ DECIDED (2026-09-02) — the wave order stands, and F2 builds the real
> thing.** Not throwaway plumbing. The reasoning: F2's function is the *safest
> possible* first Edge Function — it takes a row id, embeds it, writes a vector.
> It assembles no context and spans no records, so its blast radius is close to
> nil, and A1 inherits a proven pattern instead of inventing one under a gate.
> **Four conditions apply — §10.**

**🟡 SCOPE — the `vector` extension is not enabled.** The only extension any
migration creates is `pgcrypto`. Enabling it is one line; the real blocker is the
**dimension**, which bakes the embedding model into the schema — `vector(1536)`
for the recommended `text-embedding-3-small`. Changing it later means
re-embedding everything, so **decision 4 is due before this migration is
written**, one wave earlier than the run doc implies.

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
pass every other gate. **One small PR — and the F2 decision moves it a wave
earlier. F2 (Wave 5) is now the first code in the repo that calls a model, so
this is owed before F2, not before A1.**

**🟠 DECISION — which model provider and model.** Specified nowhere. CLAUDE.md's
stack says only *"Edge Functions for all AI calls."* Still open. Recommendation
in §10, row 4: Claude for generation, OpenAI `text-embedding-3-small` at 1536
dimensions for embeddings, because **Anthropic has no embedding endpoint** — two
vendors, not one. **The embedding half is due before F2 in Wave 5, not here**;
only the generation half waits for A1.

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

**Gate:** A1 merges only at 09:30 with Ivan present. A2 does not. **Widened by
the F2 decision: the gate reviews all of `supabase/functions/`, F2's embedding
function included, not only A1's own.** This has to be written into A1's prompt
before Wave 6, or it will not happen.

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

**✅ DECIDED (2026-09-02) — the slice formula.** Standard Slicing Pie,
unmodified: **non-cash × 2, cash × 4.** Time is `hours × rate × 2`; cash and
expenses are `amount × 4`. `rate_cents` and `multiplier` **freeze onto the ledger
row at insert**, and `value_cents` derives from that frozen pair — so a later
rate change applies forward only and can never rewrite history. Slice
percentages are computed at read time from the row values and **never stored.**

**Gate:** merges at 09:30 with Ivan present, no exceptions.

> **✅ DECIDED (2026-09-02) — a schema session is slotted upstream of Wave 7:**
> `contribution_ledger`, the `bricks` estimate columns, the deterministic slice
> function, pgTAP and RLS, run in the schema sandbox. Unblocked by the formula
> decision above. **That session's prompt is not yet written** — this is now the
> largest remaining piece of work in the run doc's Stream A column, and it is
> three waves out.

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

> **✅ DECIDED (2026-09-02) — stay on Hobby (Free) for now.** Four consequences,
> the first verified against Vercel's docs and the rest to plan around:
>
> 1. **Preview deployments can still be protected.** Vercel Authentication
>    (Standard Protection) is available on Hobby, so previews are not public by
>    URL — invariant 9 survives. The production domain stays public, which is
>    intended. **Confirm it is switched on**, since a preview will carry seeded
>    Family content.
> 2. **Named/custom environments are a Pro feature.** So R1's *"staging and
>    production differ only where the X1 README says"* has to ride on
>    **Preview-vs-Production environment variables inside the one project** —
>    which Hobby does scope separately. There is no third, stable `staging` URL.
> 3. **The quota already ran out once** (`b3204cc`), and nothing about that
>    changed. Expect it again; R1's *"one-command deploy from main, gated on green
>    CI"* should not also spend preview builds on every push.
> 4. **Hobby is documented as being for personal, non-commercial projects.** A
>    platform with an equity engine is not that, so this needs revisiting before
>    F4milia is commercial — a plan decision deferred, not a plan decision closed.

**Not a blocker, better than expected:** R1's *"grep for undecided migrations
returns zero"* is already satisfied — **all 75 migrations carry a `-- Reverse:`
header.** What is missing is that none has been *executed*; R1's rollback drill
is real work, but it starts from documented down-paths rather than from nothing.

---

## 10. Decisions — the checklist

Numbering is stable: a row keeps its number for the life of this document, so
"decision 4" means the same thing in every doc that cites it. Ruled rows state
the ruling, not the recommendation that produced it.

### ✅ Ruled

| # | Decision | Blocked | The ruling |
|---|---|---|---|
| 1 | Storage per-file cap, per-Family quota, blob on delete | C2 | **On Supabase Free** — 1 GB project-wide, not per Family: **5 MB per file**, set on the bucket row as well as in the app · **100 MB per Family** · deleting a message **deletes the blob**. Sized for **8 concurrent Families** (decision 12), which consumes the usable budget exactly. **Free adds scope:** per-Family quotas do not bound the project total, so C2 needs a project-level check too. Reasoning in §3 |
| 2 | `message_reactions` as its own table, not the legacy `reactions` | C2 | **Its own table, keyed on `membership_id`.** Plan-independent. Extending the legacy table would mean rewriting stage-gating across `posts_rls` and `content_gating` so a chat reaction is not silently gated by a Trib4l stage — a bug that looks like it works. A new table is one migration reusing `is_conversation_participant()`. Reasoning in §3 |
| 3 | What search covers | F1, Wave 5 | `table_entries` and `bricks` gain a `search_vector`; legacy `posts`/`comments` stay in scope; **`ledger_events` is cut.** F1 is a two-table migration. The cut is a knowingly unmet acceptance criterion, recorded in §5 |
| 6 | The slice formula | A5, Wave 7 | Standard Slicing Pie, unmodified: **non-cash × 2, cash × 4.** `rate_cents` and `multiplier` freeze onto the ledger row at insert; `value_cents` derives from the frozen pair; slice % computed at read time and never stored; a rate change applies forward only |
| 8 | Vercel plan and project shape | R1, Wave 10 | **Hobby (Free), one project, for now.** Preview protection is available on Hobby so invariant 9 holds; named staging environments are not, so R1 uses Preview-vs-Production env vars in the single project. Revisit before F4milia is commercial — Hobby is documented as non-commercial. Consequences in §9 |
| 9 | F2 / A1 ordering | Wave 5 | **No swap — the run doc's wave order is followed.** F2 keeps Wave 5 and builds the first Edge Function itself, under the four conditions below |
| 10 | Service worker ownership | N1, Wave 4 | The PWA shell — manifest, icons, a registered but empty service worker — ships as **its own small PR before Wave 4.** W2 builds its UI on it; N1 adds only a `push` handler |
| 11 | The equity engine | A5, Wave 7 | A **schema session is slotted upstream of Wave 7**: `contribution_ledger`, the `bricks` estimate columns, the deterministic slice function, pgTAP, RLS, in the schema sandbox. Unblocked by row 6. **Its prompt is unwritten** |
| 12 | Expected concurrent Families | C2 | **8.** Fixes the per-Family quota at 100 MB — and `8 × 100 MB = 800 MB` is the usable budget exactly, so the ceiling invariant holds with equality and has no slack. Also makes `max_families = 8` a real constraint, which nothing in the system enforces; see decision 14 |

### 🟠 Open — six

| # | Decision | Blocks | Recommendation on the table |
|---|---|---|---|
| 4 | Model provider, model, and the API keys | **F2, Wave 5** (see note) · A1, Wave 6 | **`claude-opus-5`** for generation at `effort: "low"`, called from a Supabase Edge Function. **OpenAI `text-embedding-3-small`, 1536 dimensions**, for embeddings — Anthropic has no embedding endpoint, so this is two vendors and two keys, both in Supabase secrets, never a Vercel env or the client bundle. Costs and the cheaper levers: `ai-model-and-cost.md`. An earlier draft here named `claude-sonnet-5`; that was a cost downgrade made without asking, and is corrected |
| 5 | AI cost ceiling | A1, Wave 6 | 10 suggestions/member/hour · 100/Family/day · `output_config: {effort: "low"}` with **`max_tokens: ~2048`** · an `AI_DISABLED` kill switch returning a plain refusal. Reuse `lib/email`'s rate-limit pattern. **The cap IS the budget:** 100/Family/day on Opus 5 uncached is ~$1,140/month at 8 Families; prompt caching takes that to ~$276. Set the numbers against `ai-model-and-cost.md` §3, not against intuition. **`max_tokens: 1024` was wrong** — thinking bills as output and counts against the cap, so it can truncate the suggestion |
| 7 | PostHog cloud or self-hosted | Q3, Wave 9 | Cloud, EU region. Self-hosting means running ClickHouse to receive event names and counts; invariant 4 already bounds the payload in code |
| 13 | **Ledger durability on Free** | the equity-engine schema session, before Wave 7 | Supabase Free does not include point-in-time recovery, and its backup guarantees are weaker than Pro's — **believed, not verified against your dashboard.** CLAUDE.md calls the Ledger *"a system of record for eventual ownership"*, so this wants deciding before it holds real slices: accept Free for pre-production, or upgrade when the engine ships |
| 16 | **The app icon** | W2 (Stream B, Wave 4) · unblock-plan PR 3 | The only brand asset in the repo is the default `app/favicon.ico`, and a PWA manifest needs 192px and 512px icons to be installable. **Recommended: a provisional mark from locked tokens only** — masonry motif, Deep Slate, zero radius, no invented lettering — shipped labelled as provisional so the shell is testable without a brand decision being made silently. Replace before any public install |
| 15 | **The read mark's design** | **N1, Wave 4** | The mark is a **timestamp high-water**, so a message committing after the mark but carrying an earlier `created_at` counts as read without being seen — the sibling of the `audit_log.created_at` transaction-time lesson. Either a `seq`-style monotonic column on `messages`, or per-message read receipts. **Recommended: the monotonic column** — cheaper, and it is how `audit_log` already solved this exact ordering problem. Receipts only if *"who has seen this"* is a product requirement rather than a badge |
| 14 | **How the 8-Family cap is enforced** | **C2, now** · every signup path | Decision 12 makes `max_families = 8` load-bearing, and nothing in migrations, `app` or `lib` implements any such limit — so an `organizations` INSERT can break the storage ceiling, and the symptom lands on an unrelated Family's upload. **Recommended: a hard cap at Family creation with a plain refusal**, reversible by one constant. The alternative, monitor-and-alert, leaves the invariant as prose |

> **Row 4 moved a wave earlier.** Decision 9 keeps F2 in Wave 5, and F2 cannot
> write its migration without the embedding provider *and* the dimension:
> `vector(1536)` bakes the model choice into the schema, and changing it later
> means re-embedding everything. The **generation** half of row 4 — Claude, the
> model, its key — is still A1's, in Wave 6.

### Conditions attached to decision 9

F2 creates `supabase/functions/` one wave before the session whose 09:30 gate
exists to get Edge Function isolation right. Four conditions make that safe, and
all four are obligations on a session, not notes:

1. **F2's function is write-only and single-row** — it takes a row id, embeds it,
   writes the vector. It never assembles context, never spans records, never
   returns content. Stated in F2's PR description as a constraint, not as a fact.
2. **The embedding table carries the same RLS as its source table** (invariant 5),
   proven with the dual-Family fixture on every read path.
3. **A1's gate covers all of `supabase/functions/`**, F2's function included — not
   only A1's own file. This widens A1's gate and must be written into A1's prompt.
4. **Invariant 12 lands before F2, not before A1.** F2 is the first code in the
   repo that calls a model, so it is the first that could ship a prompt offsite.

### Owed, no decision needed — awaiting a go-ahead

| Item | Why now | Size |
|---|---|---|
| Sentry: DSN to the environment, `dataCollection` options set explicitly off | Invariant 12, and condition 4 above moves it ahead of Wave 5 | One small PR |
| `search_path` / `pg_temp` on the 16 `SECURITY DEFINER` functions | Every C1 policy calls `is_org_member()` / `has_org_role()` | One migration |

### Accounts and keys only James can create

| Key or account | First needed by |
|---|---|
| OpenAI API key (embeddings) | **F2, Wave 5** |
| Anthropic API key (generation) | A1, Wave 6 |
| Inngest account and keys | N1, Wave 4 |
| VAPID keys for web push | N1, Wave 4 |
| PostHog project | Q3, Wave 9 |
| Vercel Pro upgrade | R1, Wave 10 — but the hobby quota bites sooner |

`@react-pdf/renderer` (K1, Wave 8) and the `vector` extension (F2, Wave 5) are
**not** in this table: they need no account, key or spend — an `npm install` and
one migration line, done by the session that needs them. The only unknown is
whether the hosted Supabase plan exposes `pgvector`; see §13.

## 11. Sequencing problems — all three ruled on

Three places where the wave table's own ordering was the blocker. None is open.
Each entry keeps the original problem statement, then the ruling.

1. **F2 (Wave 5) needs A1 (Wave 6).** Semantic search cannot embed anything
   without the Edge Function and model key A1 establishes. ✅ **The wave order
   stands** — the run doc is followed. F2 builds the first Edge Function itself:
   write-only, single-row, no context assembly, and A1's gate widens to review
   it. Four conditions in §10. What this pulls forward: the embedding key and
   vector dimension (decision 4) and the invariant 12 PR, both now due **before
   Wave 5**.
2. **N1 (Wave 4) needs W2 (Wave 4, other stream).** Web push needs a service
   worker; the PWA shell is W2's. ✅ **The shell ships as its own PR before Wave
   4** — manifest, icons, an empty registered service worker. W2 builds on it,
   N1 adds a `push` handler, neither creates the file.
3. **No session builds the equity engine**, yet A5 (Wave 7) assists it and K1
   (Wave 8) reports on it. ✅ **A schema session is slotted upstream of Wave 7**,
   which is the remedy the wave table's own Wave 0 note prescribes: *"a gap that
   a Wave 4+ session silently assumes gets slotted upstream of that wave, or the
   wave table gets re-cut."* Its prompt still has to be written; that is the
   open work, not the decision.

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

One thing I did **not** verify and am flagging as such: whether the Supabase
plan in use supports `pgvector` on the hosted side. The plan is now known to be
**Free** (per the storage ruling in §3), and `pgvector` is believed available on
every Supabase tier — but that is belief, not a check I ran, and the same applies
to the Free-plan backup claim in decision 13. Local is a migration away; hosted
needs the extension enabled in the dashboard, and F2 (Wave 5) needs it.
The slice formula — the other unverified question in the original draft — is now
decided outright (§10, row 6), so it is no longer a question about a spec
document elsewhere.
