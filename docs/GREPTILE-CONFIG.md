# Greptile configuration

Why the run doc's Greptile tiering could not be built as written, and what
replaced it.

| | |
|---|---|
| **Verified** | 2026-08-31 against Greptile's live docs (first found 2026-08-28) |
| **Status** | **Implemented** — PR #27 |
| **Decision by** | James, 2026-08-31 |

---

## 1. What the run doc asks for

Pre-flight item 1 of *F4milia — Complete Run Doc* lists nine **"Greptile
trigger paths"**:

```
supabase/migrations/**   lib/auth/**      **/rls*
**/conversations/**      **/messages/**   **/contribution/**
**/ai/**                 **/storage/**    app/admin/**
```

The review-tier rule then treats a PR as Greptile-tier when it touches one of
them. The intended model: Greptile deep-reviews the high-stakes paths,
CodeRabbit covers everything else.

## 2. Why it cannot be built as written

**Greptile has no path-based include mechanism.**

- There is **no top-level `scope` key**. `scope` exists only nested inside
  `customContext.rules` / `.files` / `.other`.
- `ignorePatterns` — **exclusions** — is the only path filter. There is no
  include counterpart.

Confirmed two ways:

**The docs.** The reference is explicit that only exclusions are supported.
Re-checked 2026-08-31; the schema is unchanged.

**Observed behaviour.** On PR #1 Greptile commented on `app/layout.tsx`; on
PR #2 on `.github/workflows/pgtap.yml`. Neither matches any glob. PR #2
contained exactly one in-scope file — a migration, the first glob in the list —
and Greptile said nothing about it.

So the `scope.include` block this repo shipped was **inert from the day it was
written**, for roughly 20 commits, while looking exactly like a working config.

## 3. What replaced it

The one gate Greptile does offer is a **label allowlist**. `greptile.json` is
now:

```json
{
  "labels": ["greptile"],
  "ignorePatterns": "lib/supabase/database.types.ts\npackage-lock.json\nnext-env.d.ts\ntsconfig.tsbuildinfo"
}
```

- **Greptile reviews a PR if and only if it carries the `greptile` label.**
- The nine trigger paths survive as the **checklist a person applies**, moved
  into `f4milia-testing-workflow.md` and marked plainly as not tool-enforced.
- `ignorePatterns` removes review noise that appears in every schema PR:
  `database.types.ts` is 2,207 regenerated lines, `package-lock.json` is
  11,317.

## 4. How to use it

**Label at creation** — this is the only path the documentation guarantees:

```
gh pr create --label greptile ...
```

Greptile's docs do not state whether adding a label to an already-open PR
starts a review, and `triggerOnUpdates` describes reviews as firing on commit
events.

**If no review appears**, comment `@greptileai` on the PR. The troubleshooting
page offers exactly this for a PR *"excluded by filters"*:
> Comment `@greptileai` to force a review.

## 5. What this costs

**It fails open.** A forgotten label means no deep review at all — silently,
with nothing on the PR to show a gate was skipped. That is the inverse of how a
safety gate should fail, and it was accepted deliberately rather than
overlooked.

Two things limit the damage:

- **CodeRabbit runs unconditionally on every PR.** Nothing goes unreviewed —
  only un-*deeply*-reviewed.
- **Measured value so far says Greptile is supplementary, not the gate.** Over
  two PRs: CodeRabbit 30 findings (~18 actionable), Greptile 4 (~2). CodeRabbit
  found both of the most serious issues to date — the `pg_temp` search-path
  escalation on the `SECURITY DEFINER` audit function, and the destructive
  button at 4.11:1 that every token-level guard passed. Greptile's one
  high-value find was genuinely cross-file (an unreachable dark theme, inferred
  from *absent* code). **Zero substantive duplicates between the two**, so
  running both costs nothing in redundancy.

**If the forgotten-label case ever bites**, the fix is a CI job that matches
changed paths against the list in §1 and applies the label itself — making the
gate fail *closed*. Deliberately not built yet.

## 6. Also worth knowing

- A **`.greptile/` folder** now takes precedence over `greptile.json` and
  supports cascading per-directory overrides and structured rules with
  severity. Relevant if per-path *rules* (rather than per-path scoping) become
  useful.
- **The run doc's pre-flight item 1 is left as written.** Wave content is not
  edited during alignment; this report and `f4milia-testing-workflow.md` carry
  the correction.
- Re-decide at the **Wave 1 retro**, which is already scheduled to reconsider
  the glob list against measured `clean`/`rework` data.

## 7. Sources

- https://www.greptile.com/docs/code-review/greptile-json-reference
- https://www.greptile.com/docs/code-review/greptile-config
- https://www.greptile.com/docs/code-review/developer-essentials
