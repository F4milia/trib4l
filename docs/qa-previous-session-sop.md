# QA of Session N-1 — Mechanical SOP

**Goal:** the manual verification of the *previous* session happens *while the current session generates*, takes under 30 minutes, requires no thinking about what to test, and leaves a timestamped trail that proves it happened.

If any step here requires judgment about *what* to test, the SOP has failed. The thinking happens once, at session prep time. Execution is a checklist.

---

## The loop

```
Session N generating in worktree A
   └─ meanwhile, dev runs docs/qa/N-1.md against N-1's preview URL
        ├─ records Loom while going
        ├─ ticks boxes in the qa doc, pastes Loom link
        └─ commits qa doc → PR N-1 gets its "QA" check → merge
```

The commit timestamp on `docs/qa/N-1.md` must fall *inside* session N's run window. That single fact is how Ivan knows the SOP is being followed without asking.

---

## Install status — trib4l, 2026-09-02

| Piece | State |
|---|---|
| `.github/pull_request_template.md` | ✅ installed, with CLAUDE.md's 5(a)/(b)/(c) blocks folded in |
| `.github/workflows/qa-gate.yml` | ✅ installed, **not** a required check yet — see below |
| `docs/qa/_TEMPLATE.md` | ✅ installed |
| CLAUDE.md standing workflow item 8 | ✅ added — Claude writes the QA doc before opening the PR |
| **Prerequisite 1 — preview deploys** | ✅ **restored in `#91`**, and proven on that PR: a Preview deployment went Ready in 59s and the PR carried a live URL. `deploymentEnabled` is now an object disabling only `main`, so production stays manual. **Caveat:** the original disable was caused by the hobby-plan build quota, not by policy, and the plan has not changed — see below |
| **Prerequisite 2 — named seed fixtures** | ⏳ **Stream B's.** `#88` already seeded domain data and two Families that differ; the QA fixture roles below are being added there too (James, 2026-09-02). Not touched from Stream A — `supabase/seed.sql` is Stream B's surface, and editing it here is the cross-stream collision CLAUDE.md workflow item 4 says to stop and report |

**Preview deploys are back; the fixtures are the last piece.** The repo-side
scaffolding is in place, so the loop starts the day Stream B's fixtures land,
with no further setup.

> **The quota caveat, because it will bite again otherwise.** Previews were not
> disabled for policy reasons. `b3204cc` records the cause: preview builds
> exhausted the **free-tier quota** (`Deployment rate limited, retry in 24
> hours`), leaving the Vercel check red on every PR. The team is still on the
> **hobby** plan, so the ceiling is unchanged and the same failure can recur.
> Two fixes, neither applied yet: upgrade the plan, or add an `ignoreCommand`
> skipping builds whose commits touch only `docs/`, `supabase/`, `tests/` and
> `.github/` — most of this repo's traffic. The second composes with this SOP,
> since docs PRs carry `skip-qa` and need no preview.

Making qa-gate a **required** status check is a branch-protection change
(Settings → Branches) and is deliberately left off: switching it on today would
block every in-flight PR, none of which carry a Loom link.

---

## Prerequisites (one-time, ~2 hours, do this week)

### 1. Preview deploys must exist per PR — ✅ done, `#91`
**Done in `#91`.** It had indeed killed them: `deploymentEnabled: false` as a bare boolean disables git deployments for *every* branch, previews included. It is now an object disabling only `main`, so PR branches deploy and production stays manual. Proven on `#91` itself — Preview Ready in 59s, live URL on the PR.

The original options, kept for the record:

- **Re-enable Git deploys, preview only.** In Vercel project settings, keep Production branch = `main` but disable auto-production deploys if that was the concern; leave Preview enabled. Or use `ignoreCommand` in `vercel.json` to skip only `main`.
- **CI deploy.** A GitHub Action runs `vercel deploy --token=$VERCEL_TOKEN` on every PR and posts the URL as a PR comment.

Either way: every PR has a preview URL visible on the PR within minutes of push. Non-negotiable.

### 2. Named seed fixtures
The wave table's edge cases keep using the same actors. Seed them once in `supabase/seed.sql` with stable emails, and every QA doc references them by name instead of "create a user who...":

| Fixture | Purpose | Email |
|---|---|---|
| Dual-Family user | member of Family A and Family B | `dual@f4milia.test` |
| Blocked pair | user X has blocked user Y | `blocker@` / `blocked@f4milia.test` |
| Departed member | left Family A mid-Build with open Bricks | `departed@f4milia.test` |
| Memorial-locked account | deceased-member lock state | `memorial@f4milia.test` |
| Non-creator second member | joined, didn't create the Family | `second@f4milia.test` |
| No-Family user | signed up, never joined | `orphan@f4milia.test` |
| Platform staff (2, with 2FA) | staff/audit routes | `staff1@` / `staff2@f4milia.test` |

Same password for all test accounts, stored in the team password manager, not the repo. Preview deploys point at the staging Supabase project, which is reset to seed nightly (Inngest cron or a scheduled GitHub Action running `supabase db reset --linked` against staging only).

### 3. PR template with a QA block
`.github/pull_request_template.md`:

```markdown
## Session
<!-- e.g. C1 chat schema + realtime -->

## Run log
- Run started:
- Run finished:
- Prep for next session committed before run finished: yes / no

## QA (filled in by whoever verifies, during the *next* session's run)
- [ ] `docs/qa/<SESSION>.md` executed against preview URL:
- [ ] Loom:
- [ ] All edge cases pass, or failures filed as issues and linked here:
```

### 4. A CI check that enforces the QA block
`.github/workflows/qa-gate.yml` — fails until the PR body contains a Loom URL and a checked QA box. Make it a required status check on `main` alongside Greptile **only once prerequisites 1 and 2 are done** — before then, no PR can produce a preview URL or a Loom link, so requiring it blocks everything in flight. See the install-status table at the top.

**Installed in trib4l** as `.github/workflows/qa-gate.yml` — see that file for the
version actually running. Two corrections were needed against the sketch below:

- **`labeled` and `unlabeled` must be in `types`.** Without them, adding the
  `skip-qa` label does not re-run the check, so the PR stays red until someone
  pushes an unrelated commit.
- The `skip-qa` `if:` is `!contains(github.event.pull_request.labels.*.name, 'skip-qa')`
  on the **job**, not on a step.

```yaml
name: qa-gate
on:
  pull_request:
    types: [opened, edited, synchronize, reopened, labeled, unlabeled]
permissions:
  contents: read
jobs:
  gate:
    runs-on: ubuntu-latest
    if: ${{ !contains(github.event.pull_request.labels.*.name, 'skip-qa') }}
    steps:
      - name: Require Loom + QA checkbox
        # Body is untrusted input: it goes through env:, never interpolated
        # into the shell.
        env: { BODY: ${{ github.event.pull_request.body }} }
        run: |
          printf '%s' "$BODY" | grep -Eq 'https://(www\.)?loom\.com/share/' || { echo "::error::No Loom link in PR body"; exit 1; }
          printf '%s' "$BODY" | grep -Eq '^\- \[[xX]\] `docs/qa/' || { echo "::error::QA doc not marked executed"; exit 1; }
```

**Do not make it a required check until prerequisites 1 and 2 are done.**
Turning it on now would block every in-flight PR, since none of them carry a
Loom link.

---

## Per-session flow

### At the END of every Claude Code session (Claude writes this, not the dev)
Add to the standing preamble in the run doc / CLAUDE.md:

> Before opening the PR, create `docs/qa/<SESSION_ID>.md` using the template below. Expand the session's "Manual Verification Focus" from the wave table into numbered steps with concrete expected results, using only the named seed fixtures. Add a "Regression" section listing the 2–3 behaviors from the previous two sessions most likely to have been disturbed by this change. Do not exceed 15 steps.

Template:

```markdown
# QA — <SESSION_ID> <session name>
Preview URL: <filled by dev from PR>
Fixtures used: dual@, blocked@ ...

## Primary check (from wave table)
<one line: the Manual Verification Focus verbatim>

1. Log in as `dual@f4milia.test`. Open Family A → Chat.
   **Expect:** only Family A conversations listed. No Family B names anywhere.
2. Switch to Family B.
   **Expect:** ...

## Regression (previous two sessions)
- [ ] S2: sign-out-everywhere still terminates the second browser session
- [ ] E1: preference toggle survives leave + rejoin

## Result
- [ ] All pass
- Failures → issue links:
- Loom:
- Executed by / at:
```

### At the START of every session (dev, ~30 min, during generation)
1. Kick off session N in its worktree.
2. Open PR N-1, copy the preview URL into `docs/qa/N-1.md`.
3. Start Loom screen recording.
4. Run the numbered steps exactly. Tick boxes. Don't improvise extra checks — if something obvious is missing, that's a note for the template, not this run.
5. Anything that fails: open a GitHub issue titled `QA fail — <SESSION> step <n>`, link it in the doc. Don't fix it now.
6. Stop Loom, paste link into doc and PR body.
7. Commit the qa doc to the N-1 branch, push. The qa-gate check goes green; PR N-1 is mergeable.
8. Back to session N.

If step 4 takes more than 30 minutes, the qa doc is too long. Claude's instruction is capped at 15 steps for a reason.

---

## Graduation rule — the manual list shrinks

Every manual step that passes twice in a row becomes a ZeroStep test in the next wave's Stream B slot:

```ts
test('dual-family user sees only own conversations', async ({ page }) => {
  await ai('Log in as dual@f4milia.test and open Family A chat', { page, test });
  await ai('Verify no conversation names from Family B are visible', { page, test });
});
```

The wave table's Q4 "full E2E" session should be mostly *assembly* of tests that already exist from graduation, not net-new authoring. If manual QA is still 15 steps a session by Wave 6, graduation isn't happening.

---

## What Ivan checks weekly (5 minutes)

1. `git log --format='%ad %s' --date=iso -- docs/qa/` — every qa doc commit should land during a later session's run window, not after the shift.
2. qa-gate is a required check on `main` in both repos (Settings → Branches → protection rules).
3. Count of ZeroStep tests in `tests/` is going up wave over wave.
4. Loom durations in the QA docs are under 30 minutes.

If (1) shows qa docs committed in a batch at shift end, the SOP is being back-filled. That's the conversation to have — not about hours.
