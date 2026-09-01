# Production constraints

Ceilings that come from the **plan and the infrastructure**, not from the code —
the kind that pass every test and bite at launch.

| | |
|---|---|
| **Written** | 2026-09-02 |
| **Decided** | Supabase **Free**, Vercel **Hobby**, **8 Families maximum** (James, 2026-09-02) |
| **Verified against** | supabase.com/pricing and vercel.com/docs/limits, fetched 2026-09-02 — not from memory |
| **Read before** | C2 (storage), N1 (realtime + push), F2/A1 (Edge Functions), K1 (storage), R1 (deploy) |

A limit here is not a bug to fix. It is a number the product has to be designed
around, or a decision to spend money instead.

---

## 1. The four that are actually dangerous

Everything else on this page is arithmetic. These four change what the product
can promise.

### 1.1 No backups. No point-in-time recovery.

Supabase Free includes **neither**. CLAUDE.md's first paragraph says:

> *"The Ledger is a system of record for eventual ownership — treat every write
> to it accordingly."*

A system of record for **ownership**, with no backups, is the sharpest conflict
on this page. It is not a code problem and no session fixes it.

**Options:** upgrade before real Families exist; or run scheduled `pg_dump` to
external storage and treat that as the backup story; or state plainly that the
Ledger is not yet durable and do not onboard a venture-oriented Family until it
is. **Pick one before launch** — the default is the third, silently.

### 1.2 Free projects pause after one week of inactivity

A paused project is a **down product**. Eight Families, a quiet week over a
holiday, and the app is off when they come back — with no incident, no alert,
and nothing in the logs, because nothing happened. That is the point.

**Mitigation if staying on Free:** something must touch the database weekly. A
cron that runs a trivial query is enough, and it should be monitored, because a
silently-failed keepalive looks exactly like a working one.

### 1.3 Maximum 2 active projects

Staging + production is **exactly two, with nothing left over**. R1's brief —
*"staging and production differ only where the X1 README already says they do"* —
is achievable, but there is no room for a third environment, a scratch project,
or a per-developer database.

### 1.4 Realtime concurrent connections: 200, and we plan for ~192

8 Families × 12 members = **96 people**. Two devices or tabs each is **192
concurrent connections — 96% of the ceiling.**

C1 already ships realtime chat, so this is live, not hypothetical. A third tab
open across a handful of members puts it over. The failure is a subscription
that never joins, which in the UI looks like "chat is broken for some people
sometimes".

**Before launch:** decide whether one connection per member per device is
enforced, and what the client does when a join is refused.

## 2. Supabase Free — the numbers

Fetched from supabase.com/pricing, 2026-09-02.

| Limit | Free | What it means here |
|---|---|---|
| File storage | **1 GB** | §3. The whole budget for every attachment in the product |
| Max upload size | **50 MB** | Our per-file cap is 5 MB, well under |
| Database size | **500 MB** | ⚠️ see below — `audit_log` is the risk, not user content |
| Egress | **5 GB** + 5 GB cached | Images served from storage count against this |
| Monthly active users | **50,000** | Not a constraint at 96 people |
| Realtime peak connections | **200** | ⚠️ §1.4 — we plan for ~192 |
| Realtime messages / month | **2 million** | ⚠️ see below |
| Edge Function invocations | **500,000** | F2 embeds on write; A1 calls per suggestion |
| Automatic backups | **Not included** | ⚠️ §1.1 |
| Point-in-time recovery | **Not included** | ⚠️ §1.1 |
| Project pausing | **after 1 week idle** | ⚠️ §1.2 |
| Active projects | **2** | ⚠️ §1.3 |

### 500 MB database — the risk is `audit_log`, not content

Text is small; 96 people cannot write 500 MB of Table entries. **`audit_log`
can.** Invariant 5 puts a trigger on every table in `public` — 30-plus tables,
every mutation, append-only — and CLAUDE.md's own PERF-2 note says the table has
**no retention policy**.

Nothing in the run doc schedules one. Worth a decision before the row count
makes it a migration rather than a policy.

### 2 million Realtime messages/month — typing is the variable

Messages are counted **per delivery, not per send**. A message in a 12-person
Family channel is one insert and up to eleven deliveries. On top of that, C1's
typing indicator is a **broadcast per keystroke burst**, and C2 adds reactions
and threading, both of which will want live delivery.

I have not modelled this to a number and will not pretend to — the input that
dominates it (typing bursts per member per day) is unknown until real use. What
matters is the shape: **typing indicators are the largest and least valuable
consumer**, and they are the first thing to rate-limit or drop if the meter
climbs.

## 3. The storage budget, worked

**1 GB total, 8 Families, and attachments are not the only consumer.**

| | |
|---|---|
| Plan total | 1024 MB |
| 8 Families × 100 MB | **800 MB** |
| Remaining | ~224 MB for Keepsake PDFs (K1) and slack |

### The quota is per **Family**, not per feature

This is the part that is easy to get wrong. M1 (Wave 5) adds photos on Table
entries and attachments on Bricks, *"reusing Wave 3's storage policy pattern,
same quotas, same caps."* If M1 gets its **own** 100 MB per Family, the budget
becomes 1600 MB and the plan is blown before Wave 6.

> **So C2 must build the quota as "this Family's total across the attachment
> buckets", not "this Family's message attachments."** Then M1 inherits the
> ceiling instead of adding a second one.

### Per-Family quotas do not bound the project total

Eight Families each sitting **inside** their 100 MB is exactly 800 MB, and
nothing stops a ninth Family existing. The failure mode is a Family under its own
quota whose upload fails anyway with a raw Supabase error — which breaks C2's
acceptance criterion (*"quota exceeded fails with a plain message, not a broken
upload"*) in a way the per-Family check structurally cannot catch.

**Decided 2026-09-02 (James): the project-level guard is in C2's scope.**

## 4. Vercel Hobby

Fetched from vercel.com/docs/limits, 2026-09-02.

| Limit | Hobby |
|---|---|
| Deployments per day | **100** |
| Builds per hour | **100** |
| CLI source upload | 100 MB |

**This already caused an outage.** `b3204cc` records preview builds exhausting
the quota — `Deployment rate limited, retry in 24 hours` — which left the Vercel
check red on every PR and led to git deploys being switched off entirely.
Previews were restored in `#91`; **the plan has not changed, so it can recur.**

Two mitigations, neither applied:

1. **Upgrade**, or
2. **`ignoreCommand`** skipping builds for commits touching only `docs/`,
   `supabase/`, `tests/` and `.github/` — most of this repo's traffic. It
   composes with the QA SOP, where docs PRs carry `skip-qa` and need no preview.

**One project serves both preview and production** (`f4milia_production`). R1
wants staging and production to differ; today they are the same project, and the
Supabase 2-project cap (§1.3) constrains the other half of that split.

## 5. Not plan limits, but they bite in production

Three landmines that are about configuration rather than ceilings.

**`EMAIL_DELIVERY_MODE` defaults to `dry-run`.** A production deploy that forgets
to set it **silently drops all mail while the UI reports success**. Recorded in
`d1-readiness.md` §4 as owed and still outstanding. This is the most likely thing
on this page to actually happen.

**The Sentry DSN is hardcoded** in `sentry.edge.config.ts`,
`sentry.server.config.ts` and `instrumentation-client.ts`, so CI and staging
report into the production project. And `dataCollection` is present with **every
option commented out**, so it inherits permissive defaults — `userInfo`,
`httpBodies`, **and genAI inputs/outputs**. Invariant 12 requires both fixed, and
dates it *"before the first AI session (Wave 6 / A1)"*. See
`stream-a-blockers.md` §6.

**Sign-out-everywhere is not instant.** PostgREST validates a JWT's signature and
expiry but not whether the session still exists, so a revoked access token keeps
reading the Data API until `jwt_expiry` — **3600s by default**. True for the app
and the SDK, not for anything holding the raw token. CLAUDE.md's S2 entry is
explicit: *never promise instant total revocation in copy.*

## 6. Before launch — the checklist

| | Check | Owner |
|---|---|---|
| 1 | Backup story chosen — upgrade, external `pg_dump`, or an explicit statement that the Ledger is not yet durable | James |
| 2 | Keepalive against the weekly pause, and monitoring on the keepalive | R1 |
| 3 | `EMAIL_DELIVERY_MODE` set explicitly in the production environment | R1 |
| 4 | Sentry DSN from the environment; `dataCollection` set explicitly | before A1 |
| 5 | Realtime connection behaviour decided at ~192 of 200 | N1 |
| 6 | `audit_log` retention policy decided | unscheduled |
| 7 | Vercel build quota addressed — upgrade or `ignoreCommand` | R1 |
| 8 | Storage quota enforced per Family **across buckets**, plus the project-level guard | C2 |

## 7. If the plan changes

Everything above is a function of two choices. Upgrading changes them all at
once, so the numbers are recorded here rather than scattered through the code:

| | Free → Pro |
|---|---|
| File storage | 1 GB → 100 GB (then $0.0213/GB) |
| Per-Family quota could become | 100 MB → 1 GB, and the project guard stops mattering |
| Backups / PITR | none → included |
| Pausing | after 1 week → never |
| Active projects | 2 → more |

**The per-Family quota is one migration to change.** It was chosen tight on C1's
own precedent — *"raising a CHECK is a one-line migration that rewrites nothing;
lowering one after real messages exist means deciding what to do with the rows
that no longer fit. Start tight."*

## 8. Related

- `docs/f4milia/c2-pr-plan.md` §6.4 — the storage numbers and where they are enforced
- `docs/f4milia/stream-a-blockers.md` — what stops each Stream A session, including invariant 12
- `docs/f4milia/d1-readiness.md` §4 — the `EMAIL_DELIVERY_MODE` finding
- CLAUDE.md invariant 12 (Sentry) and the S2 entry on JWT revocation
