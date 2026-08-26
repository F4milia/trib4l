# Pre-flight audit — F4milia run doc

**Date:** August 27, 2026 · **Executor:** James Jarin · **Owner:** Ivan Rattliff

Scope of this audit: the standing preamble, "How to run this", and
**pre-flight items 1–4** of `F4milia — Complete Run Doc (Prompts Included).md`,
checked against the actual state of this repository. Stops at the wave table.
No session prompts were executed.

Source docs read: `CLAUDE.md`, `f4milia-design-system.md`,
`f4milia-testing-workflow.md`, `F4milia — Complete Run Doc (Prompts Included).md`,
`greptile.json`, `.github/workflows/{ci,pgtap,playwright}.yml`,
`docs/design-system.md`, `app/globals.css`.

---

## Correction to an earlier reading

An earlier pass called `**/conversations/**`, `**/storage/**`, `**/ai/**`, and
`**/contribution/**` dead globs. They are not. The wave table creates those
paths in Waves 2, 3, 6, and 7 respectively — they are correct by design and
light up when those waves land. `lib/auth/**` is a different case; see 1a.

---

# Blockers

## B1 — Every newly added doc and config is untracked; a worktree would see none of it

Pre-flight 3 says "confirm both see CLAUDE.md". Pre-flight 4 says confirm the
companion docs exist "in the repo the worktrees check out". `git worktree add`
checks out a **commit** — untracked files and unstaged modifications stay in the
main working tree only.

| File | Git state | What `stream-a` would see |
|---|---|---|
| `CLAUDE.md` | tracked, **uncommitted** | the old one-line `@AGENTS.md` — zero invariants |
| `f4milia-design-system.md` | **untracked** | absent |
| `f4milia-testing-workflow.md` | **untracked** | absent |
| `F4milia — Complete Run Doc (Prompts Included).md` | **untracked** | absent |
| `greptile.json` | **untracked** | absent |
| `.github/workflows/pgtap.yml` | **untracked** | absent |
| `.github/workflows/playwright.yml` | **untracked** | absent |

Both streams would launch with no invariants, no design system, no review
config, and no new CI. This is precisely the failure pre-flight 4 exists to
prevent — *"a prompt whose required reading is missing produces a session that
invents the constraints"* — and it is currently guaranteed, not merely risked.

**Fix:** commit all of these before anything else.

## B2 — Pre-flight 4 is 3-of-4: `f4milia-product-narrative-and-spec.md` is absent

Present: `CLAUDE.md`, `f4milia-design-system.md`, `f4milia-testing-workflow.md`.
Missing: `f4milia-product-narrative-and-spec.md` — not under any other name
(searched by filename and by content for "narrative" across all markdown).

Both `CLAUDE.md` and the run doc list it as required reading. It is presumably
where the Tower / Bricks / Vows / Table / Ledger data model is defined. Wave 2
(C1, conversations schema) is the first session that needs it.

---

# Pre-flight item 1 — Greptile trigger paths

`greptile.json` transcribes the doc's nine globs faithfully. Two problems.

## 1a — `lib/auth/**` does not exist, and Waves 0–1 are entirely auth

This repo's auth lives in:

- `lib/session.ts`
- `lib/supabase/proxy.ts`
- `lib/supabase/server.ts`
- `app/actions/auth.ts`
- `app/login/`, `app/signup/`

So **S1 (sign-in flows) and S2 (auth hardening) would both run CodeRabbit-only,
un-Greptiled** — the two most security-sensitive sessions in the first two
waves, reviewed by the tool `f4milia-testing-workflow.md` itself rates at ~44%
and describes as "diff-only (can't see cross-file or architectural
regressions)".

Either the glob list gains the real paths, or S1/S2 are instructed to relocate
auth under `lib/auth/`.

Also uncovered and worth adding:

- `app/actions/**` — all 15 mutation surfaces, and "every mutation writes to
  `audit_log`" is a per-session rule
- `app/api/webhooks/**`

## 1b — The Stripe exclusion is not what the doc asked for

The doc says: *"No Stripe globs — commerce stays dormant-per-Tower and nothing
in this doc touches it."* That is an instruction not to **add** Stripe to the
trigger list. `greptile.json` instead adds:

```json
"exclude": ["**/*stripe*/**"]
```

If no wave touches commerce, the exclusion never fires. The only time it does
anything is when a session unexpectedly touches commerce — precisely the case
you would want reviewed. It also does not match `lib/stripe.ts`, because the
glob requires a *directory* segment containing "stripe".

**Recommendation:** drop it.

## 1c — Nothing installs the review bots, and the config schema is unverified

Pre-flight configures Greptile's globs but never says to install the Greptile or
CodeRabbit GitHub App on `F4milia/trib4l`. `greptile.json` is inert without it.

Separately: `scope.include` / `scope.exclude` could not be confirmed as
Greptile's actual config schema. If those keys are wrong the file is silently
ignored, which is indistinguishable from it working.

---

# Pre-flight item 2 — ZeroStep path filter

The filter itself is **correct**: `app/**` + `components/**` on Playwright, no
path filter on pgTAP. Matches the doc exactly. But neither job can currently
produce signal.

## 2a — The Playwright job cannot run

- **No `playwright.config.ts` anywhere in the repo.** `npx playwright test`
  therefore defaults `testDir` to the repo root and collects the vitest files.
  Verified locally — it dies on `lib/idempotency.test.ts:1` with
  *"Vitest cannot be imported in a CommonJS module using require()."*
- **Zero Playwright specs exist.**
- `@playwright/test` is not a declared dependency (present only transitively via
  `@zerostep/playwright`).
- No `ZEROSTEP_TOKEN` secret is wired.
- No web server step, and no `webServer` config — nothing for tests to hit.
- Node 20 here vs Node 22 in the existing `ci.yml`; no `cache: npm`.

## 2b — The pgTAP job has nothing to test

`supabase/tests/database/` is **empty**. "pgTAP stays unconditional on every PR"
is currently a green check over zero tests. `pgtap.yml` also omits
`supabase db reset`, so migrations and `seed.sql` never apply, and it resolves
the CLI via `version: latest` rather than the pinned `supabase` devDependency —
`ci.yml` carries a comment explaining why that choice was deliberate there.

## 2c — Trigger-branch mismatch with existing CI

Both new workflows use `pull_request: branches: [main]`. The existing `ci.yml`
uses a bare `pull_request:`. If a stream ever opens a PR into an integration
branch, the two new gates silently skip while `ci.yml` runs.

---

# Pre-flight item 3 — Worktrees

`claude -w stream-a` is valid — `-w, --worktree [name]` confirmed, and `--tmux`
exists for "name the terminal panes".

No worktrees created yet (`git worktree list` shows only the main checkout).

This item is gated entirely on **B1**: creating the worktrees before committing
produces two streams with none of the governing docs.

---

# Pre-flight item 4 — Companion docs

Beyond B2, the arrival of `f4milia-design-system.md` surfaces three conflicts.

## 4a — Two design systems now coexist, neither marked superseded

| | `f4milia-design-system.md` (new, untracked) | `docs/design-system.md` + shipped `app/globals.css` |
|---|---|---|
| Ground | parchment `#F7F4F0` | canvas `#f5f5f0` |
| Ink | deep-slate `#1A1A1A` | ink `#1e2e2c` |
| Primary | terracotta `#C84B31` | teal `#2f5d56` |
| Accent | hearth-ochre `#E3B46B` | amber `#c98a3e` |
| Radius | `0`, unconditionally | unrestricted — 22 `rounded-` classes shipped |

`CLAUDE.md` points at the new one. `docs/design-system.md` is tracked,
committed, and reads as authoritative — it documents *why* the teal palette was
chosen (copied from a sibling BrandLamb property, per direct instruction). The
next UI session obeys whichever it reads first.

**RESOLVED — August 27, 2026.** James decided all design work follows
`f4milia-design-system.md`. `docs/design-system.md` now carries a SUPERSEDED
header pointing at it, and is retained only as the record of what is currently
shipped in `app/globals.css`. `CLAUDE.md` already pointed at the right doc.

## 4b — The port assumes a UI stack that is not installed

`f4milia-design-system.md` §11.1 and its port checklist assume:

```
shadcn ^4.8.0 (base-nova) · @base-ui/react ^1.5.0 · lucide-react ^1.16.0
cva + clsx + tailwind-merge (cn() in lib/utils.ts) · tw-animate-css ^1.4.0
```

**None are installed.** This repo has a single hand-rolled `components/ui.tsx`.
The doc's §2.6 "gaps to close on port" references `components/ui/button.tsx`,
which does not exist here.

It also specifies `@config '../tailwind.config.js'`, while this repo uses
Tailwind v4 CSS-first `@theme inline` with no config file — and
`docs/design-system.md` records that as a deliberate choice.

**Partially resolved.** The Tailwind-config half is settled by the design
system's own port checklist, which reads "copy the five brand colors into
`tailwind.config.js` (or `@theme` in v4)" — so the repo keeps its existing
Tailwind v4 CSS-first `@theme inline` approach and no config file is added.
Still open: whether to install the shadcn `base-nova` / Base UI / lucide-react
stack the doc assumes, or port the tokens onto the existing hand-rolled
`components/ui.tsx`. Settle before the first UI session, not during it.

## 4c — Terracotta primary fails WCAG AA, and no resolved value exists anywhere

`CLAUDE.md`'s seeded learned constraint:

> 2026-08-26 · (seed) · Terracotta-on-Parchment primary button is a known
> contrast flag · resolve by adjusting the token to a verified-passing value
> (Q1), never by exempting the button.

Measured contrast ratios for the tokens as shipped in the design system:

| Pair | Ratio | Verdict |
|---|---|---|
| `--primary` `#C84B31` + `--primary-foreground` `#F7F4F0` | **4.25:1** | ✗ fails AA normal text (needs 4.5:1) |
| `baked-clay` `#A04729` on parchment | **5.59:1** | ✓ passes |
| `hearth-ochre` `#E3B46B` on parchment | 1.74:1 | illegal as text or hairline on paper |
| terracotta `#C84B31` on ink `#1A1A1A` | 3.74:1 | confirms the doc's own "don't" |
| hearth-ochre `#E3B46B` on ink | 9.12:1 | ✓ dark-mode primary is sound |

The primary button label fails at normal size; it clears the 3:1 bar only as
large text or as a UI-component boundary. The design system ships **no**
resolved value, and Q1 — the accessibility pass — is **Wave 8**. As written,
every screen built in Waves 0–7 sits on a token known to fail and is then
retrofitted, which is the "exempt the button" outcome the constraint forbids,
merely deferred.

`baked-clay #A04729` is already in the palette as hover/pressed and measures
5.59:1. Promoting it to `--primary` resolves this with an **existing** token
rather than an invented color — decidable now, in pre-flight, at near-zero cost.

---

# Cross-document contradictions

## C1 — The two governing docs disagree on who merges Greptile-tier PRs

`f4milia-testing-workflow.md`:

> The human review on high-stakes PRs is shared between James (the full
> checklist below) and Ivan (present at the 09:30 merge window for
> Greptile-tier PRs). **Nothing high-stakes merges outside that window.**

Run doc, "How to run this":

> Greptile-tier PRs [...] get the session's named edge case verified by hand
> before James merges them **himself** [...] Ivan-gated sessions — the three
> exceptions: A1, A5, and any PR touching the equity ledger.

And it argues the opposite case explicitly: routing all Greptile-tier work
through Ivan *"would make his availability a false bottleneck on 90% of work
that doesn't need it."*

The run doc is newer, more specific, and self-justifying. Its own wave notes say
*"in Waves 0–2 and 5–7 most Stream A PRs are Greptile-tier — correct, not
noise"* — so under the testing doc's rule, most of the critical path waits on
Ivan daily.

**Fix:** amend the one line in `f4milia-testing-workflow.md`.

## C2 — `clean`/`rework` tagging has no home and no labels

Standing preamble item 5 makes tagging the entire learning loop
(*"this is the week-one data that makes every estimate real"*), and
`CLAUDE.md`'s Learned-constraints section says *"Every PR tagged `rework` adds
a line here."*

But `CLAUDE.md`'s own standing workflow stops at item 6 and never establishes
the tagging rule — the mechanism is referenced without being defined. And
`gh label list` confirms neither `clean` nor `rework` exists on the repo.

**Fix:** add the rule as `CLAUDE.md` standing-workflow item 7, and create the
two GitHub labels as a pre-flight step.

---

# What is already correct

Worth recording, because it is most of the surface:

- The Greptile glob list transcribes the run doc faithfully.
- The ZeroStep path filter matches the doc exactly (`app/**`, `components/**`).
- pgTAP is unconditional on every PR, as specified.
- `claude -w` and `--tmux` are real, current flags.
- `is_platform_admin()` already requires `aal2` (MFA-verified) for the
  platform_admin RLS bypass.
- `member_blocks` exists and functions, including the `08bcce5` feed fix.
- The 12-member Family cap is enforced (`lib/family-cap.ts`, commit `5cf6089`).
- `.github/workflows/ci.yml` already runs lint → typecheck → vitest → build,
  plus migrations-from-scratch, plus the 84-test real-JWT isolation suite
  (`tests/isolation/`, 16 files).

The foundation the waves build on is real. The gaps above are configuration and
document reconciliation, not architecture.

---

# Suggested pre-flight order

| # | Action | Addresses |
|---|---|---|
| 1 | **Commit** `CLAUDE.md` + the four docs + `greptile.json` + both workflows | B1 |
| 2 | **Decide the primary token** — `#A04729` at 5.59:1, or another verified value | 4c |
| 3 | ~~Mark one design system superseded~~ **done**; `@theme inline` kept. Remaining: shadcn/Base UI stack decision | 4a, 4b |
| 4 | **Fix the glob list** — real auth paths, `app/actions/**`, `app/api/webhooks/**`; drop the Stripe exclude | 1a, 1b |
| 5 | **Install Greptile + CodeRabbit**, verify the config schema, create `clean`/`rework` labels | 1c, C2 |
| 6 | **Make both CI jobs real** — `playwright.config.ts` + one smoke spec; `supabase db reset` + first pgTAP files | 2a, 2b, 2c |
| 7 | **Amend the Ivan / Greptile-tier line** in `f4milia-testing-workflow.md` | C1 |
| 8 | **Obtain `f4milia-product-narrative-and-spec.md`** before Wave 2 | B2 |
| 9 | **Create the worktrees** — last, once 1–7 are in | item 3 |

Steps 1–7 are configuration and documentation only. No application code is
touched, so none of it intrudes on a wave's session scope.
