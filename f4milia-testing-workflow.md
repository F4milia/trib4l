# F4milia — Testing & Review Workflow
### The automated pipeline plus calibrated human review. Aligned with BUILD-FORMAT.md's review tiers.

**Executor:** James Jarin  |  **Owner:** Ivan Rattliff
**Solo-dev note:** with one developer, this pipeline is load-bearing, not advisory. The human review on high-stakes PRs is shared between James (the full checklist below) and Ivan (present at the 09:30 merge window for Greptile-tier PRs). Nothing high-stakes merges outside that window.

> **Note — 2026-08-27: known conflict, deliberately left unresolved.** The
> paragraph above requires Ivan for *every* Greptile-tier PR. The run doc
> ("F4milia — Complete Run Doc (Prompts Included).md", *How to run this*)
> instead gates Ivan on **A1, A5, and any PR touching `**/contribution/**`**
> only, and argues that routing the rest through him *"would make his
> availability a false bottleneck on 90% of work that doesn't need it"* — while
> its own wave notes say most Stream A PRs in Waves 0–2 and 5–7 are
> Greptile-tier. Both readings are kept as written; neither document has been
> amended to match the other.
>
> **Standing position until it is decided:** the gate is not enforced during
> the alignment phase, and James merges. The decision is deferred to the Wave 1
> retro, which is already scheduled to re-decide the Greptile glob list against
> measured `clean`/`rework` data — the same 30 minutes, with numbers instead of
> a guess. Raised by CodeRabbit on PR #1; noted rather than resolved, at
> James's direction.

---

## The pipeline (automated, runs on every PR)

1. Claude Code generates code + tests per the session prompt.
2. PR opens, triggering:
   - **pgTAP suite** — the *stable, protected* isolation tests (member can't read another Family's rows, no role self-escalates, the dual-Family user sees exactly their own) run unchanged on every PR, plus any new pgTAP tests the PR adds for new tables or RLS policies.
   - **ZeroStep** — E2E user-flow validation, path-filtered to `app/**` and `components/**` so backend-only PRs don't wait on browser tests.
   - **CodeRabbit** — diff scan on every PR. Useful signal, not a verdict: diff-only (can't see cross-file or architectural regressions), roughly 44% catch rate per independent benchmark, low noise.
   - **Greptile** — high-stakes PRs only (trigger globs below). Full-codebase context: indexes the whole repo and catches the cross-file breaks CodeRabbit structurally can't. Higher catch rate (~82% benchmarked), noisier — expect to triage some false positives; that's the trade being paid for on purpose.

## The trigger globs (what makes a PR high-stakes)

```
supabase/migrations/**
lib/auth/**
**/rls*
**/conversations/**   and   **/messages/**
**/contribution/**
**/ai/**
**/storage/**
app/admin/**
```

Plus, always, regardless of path: anything touching money, equity math, or ownership records; any new AI-to-write path; anything Ivan marks manually in the PR description.

---

## Step 1: Triage

**High-stakes** — any trigger above fires → Greptile runs → the full path in Step 2b, merge only at 09:30 with Ivan present.

**Low-stakes** — everything else (UI components, copy, wiring to an already-existing table) → Step 2a, merge any time.

New pgTAP tests written in the same pass as the code they test are *always* high-stakes — a test can be green and still validate the wrong behavior if the same generation wrote both.

---

## Step 2a — Low-stakes path

1. Confirm all automated gates passed.
2. Read the diff for basic sanity — is this actually what the session asked for.
3. Merge. Genuinely fast is fine here; this isn't where the risk lives.

---

## Step 2b — High-stakes path: the full Testing/QA + Integration Buffer

**Testing/QA:**
1. Read every line of the diff — understand it, don't skim it. If Claude Code touched a file the session didn't mention, know why before proceeding.
2. Confirm the stable core isolation suite still passes unchanged.
3. Read the *new* tests this PR added — do they test the right thing, not just whether they're green.
4. Triage Greptile's findings — each one is either a real issue (fix-forward now) or a documented false positive (note why, in the PR). Don't dismiss in bulk.
5. Verify the session's **named edge case** by hand — every Greptile-tier session in the run doc names one; that's what gets checked here, not a general vibe pass.
6. For anything touching RLS: one manual check beyond the automated suite — sign in as a member of a different Family, try to reach the data directly, watch it fail correctly.

**Integration Buffer:**
7. Merge to a real branch and run a full regression pass, not just this PR's own tests.
8. Confirm CLAUDE.md and BUILD-FORMAT.md rules were followed — RLS not bypassed, no stray custom API route, no invented copy, AI calls server-side with the marker column present.
9. Write down anything that surprised you or was ambiguous in the session prompt — that note feeds back into the run doc as an amendment. Don't silently work around it.
10. Budget this as real time. This is the step a "2-minute sanity check" quietly skips, and it exists because even the best automated reviewer here misses roughly one bug in five.

---

## Calibration — a standing practice, not a one-time test

The first time each *new category* of high-stakes work runs (first RLS migration, first AI-to-write path, first storage policy), time it honestly: clock starts before opening Claude Code, stops when it's genuinely mergeable — full checklist done, not first successful run. Report the elapsed time, whether the generated tests were sufficient, and what the prompt failed to anticipate. That third item becomes a run-doc amendment. Real numbers from real sessions are what estimates get corrected against — never the other way around.
