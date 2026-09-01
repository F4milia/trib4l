# Claude Code Hooks — Setup for trib4l and kinkeepers

**Owner:** Ivan  |  **Executors:** James (trib4l), Ferenz (kinkeepers)
**Time to install:** ~20 minutes per repo. One PR each, titled `chore: claude code hooks`.

## Why

Hooks run outside Claude's control — the harness fires them, Claude can't skip them. Everything below is a rule we already have in CLAUDE.md that Claude sometimes forgets. Hooks make them mechanical.

Official reference: https://code.claude.com/docs/en/hooks

## What goes in the repo

```
.claude/
  settings.json          ← hook config (committed, shared by everyone)
  hooks/
    check-file.sh        ← typecheck + lint after every edit
    guard-edit.sh        ← blocks edits to gated paths
    guard-bash.sh        ← blocks destructive shell commands
    stop-tests.sh        ← tests must pass before Claude ends a turn
```

`.claude/settings.json` is project-level and merges with each dev's personal `~/.claude/settings.json`. Commit it.

### 1. `.claude/settings.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "bash .claude/hooks/guard-edit.sh" }]
      },
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "bash .claude/hooks/guard-bash.sh" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "bash .claude/hooks/check-file.sh", "timeout": 120 }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "bash .claude/hooks/stop-tests.sh", "timeout": 300 }]
      }
    ]
  }
}
```

### 2. `check-file.sh` — catch broken code the moment it's written

Runs after every file edit. Exit code 2 sends stderr back to Claude, which fixes the problem before moving on. This is the hook that saves the most human time: type errors get fixed in the same turn instead of surfacing at PR time.

```bash
#!/usr/bin/env bash
set -u
input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0
case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Lint just the changed file (fast)
# NOTE `>file 2>&1`, NOT `2>file`: eslint and tsc write diagnostics to STDOUT.
# Capturing only stderr blocks correctly and reports an EMPTY reason.
if ! npx eslint "$file" >/tmp/hook-eslint.txt 2>&1; then
  echo "ESLint failed on $file:" >&2
  cat /tmp/hook-eslint.txt >&2
  exit 2
fi

# Typecheck the project (tsc has no single-file mode with project refs).
# In a Next.js repo prefer the project's own script -- `next typegen && tsc
# --noEmit` -- or a bare tsc reports phantom errors on a newly added route.
if ! npm run typecheck --silent >/tmp/hook-tsc.txt 2>&1; then
  echo "Typecheck failed after editing $file:" >&2
  head -40 /tmp/hook-tsc.txt >&2
  exit 2
fi
exit 0
```

If `tsc` on the whole project takes more than ~30s, drop it from this hook and rely on `stop-tests.sh` for typecheck instead. Measure first. *(trib4l, measured 2026-09-02: ~3s warm, ~5s cold — it stays.)*

> **The redirection matters more than it looks.** `eslint`, `tsc` and `vitest` all write their diagnostics to **stdout**, not stderr. The original `2>/tmp/hook-*.txt` therefore captured nothing: the hook blocked with exit 2 and handed Claude an **empty** reason, which defeats the point of the hook. Measured in trib4l on a real `TS2322` — the capture file came back 0 bytes. Use `>file 2>&1` in all three scripts.

### 3. `guard-edit.sh` — enforce the Ivan gate mechanically

Blocks edits to paths that need Ivan present unless the session was started with `IVAN_GATE=1`. **Adjust the path list per repo — and verify it against `git ls-files` before trusting it.**

> The generic list below matched **2 of 8** money/ledger files in trib4l. `lib/stripe/` and `app/api/stripe/` have trailing slashes and that repo has `lib/stripe.ts` and `app/api/webhooks/stripe/route.ts`; `lib/equity/` and `lib/ledger/` do not exist yet. An inert guard is indistinguishable from a working one — the same failure as the `greptile.json` entry in trib4l's CLAUDE.md. Check with:
>
> ```bash
> git ls-files | grep -E "$GATED"     # must list every file you meant to gate
> ```
>
> Keep the not-yet-existing directories in the pattern so the guard is already armed when those directories are created. See trib4l's `.claude/hooks/guard-edit.sh` for a worked version.

```bash
#!/usr/bin/env bash
set -u
input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

# trib4l: equity ledger + anything touching money paths
# kinkeepers: PHI-touching tables, consent, Zoom S2S auth
GATED='(lib/equity/|lib/ledger/|supabase/migrations/.*(ledger|equity|slice)|lib/stripe/|app/api/stripe/)'

if echo "$file" | grep -Eq "$GATED"; then
  if [ "${IVAN_GATE:-0}" != "1" ]; then
    echo "BLOCKED: $file is an Ivan-gated path. Stop and report this to the operator; do not work around it. Gated sessions are launched with IVAN_GATE=1 claude." >&2
    exit 2
  fi
fi
exit 0
```

Launch a gated session with `IVAN_GATE=1 claude -w stream-a`. Everything else runs without it and physically cannot touch those files.

### 4. `guard-bash.sh` — no destructive shell

Write diagnostics into a `mktemp -d` directory removed by a `trap`, not fixed `/tmp` paths: a predictable path plus shell redirection lets another local user pre-create a symlink and have the hook clobber a file the developer can write.

```bash
#!/usr/bin/env bash
set -u
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

deny() { echo "BLOCKED: $1" >&2; exit 2; }

echo "$cmd" | grep -Eq 'git push.*(--force|-f)( |$)'        && deny "force push"
echo "$cmd" | grep -Eq 'git push.*[ :]main( |$)'              && deny "direct push to main — open a PR"
echo "$cmd" | grep -Eq 'supabase db (reset|push).*--linked'  && deny "db reset/push against a linked (remote) project"
echo "$cmd" | grep -Eq 'rm -rf (/|~|\.\.|\$HOME)'             && deny "rm -rf on a root/home path"
echo "$cmd" | grep -Eq 'git checkout .* -- \.$|git reset --hard' && deny "discarding working tree"
exit 0
```

### 5. `stop-tests.sh` — Claude doesn't end a turn with red tests

Fires when Claude tries to stop. If tests fail, exit 2 hands the failure back and Claude keeps working. The `stop_hook_active` check prevents an infinite loop.

```bash
#!/usr/bin/env bash
set -u
input=$(cat)
active=$(echo "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0   # already looped once; let it stop and report

# Only run if there are uncommitted or unpushed changes (skip on pure Q&A turns)
if git diff --quiet && git diff --cached --quiet && [ -z "$(git log @{u}..HEAD 2>/dev/null)" ]; then
  exit 0
fi

if ! npm test --silent >/tmp/hook-test.txt 2>&1; then
  echo "Tests failed. Fix before finishing:" >&2
  tail -60 /tmp/hook-test.txt >&2
  exit 2
fi
exit 0
```

## Install steps

1. Create the four scripts, `chmod +x .claude/hooks/*.sh`.
2. Confirm `jq` is installed (`brew install jq` / `apt install jq`). **The scripts here fail closed instead of no-opping** — a guard that cannot parse its input must not wave the call through, so a missing `jq` blocks with an actionable message rather than silently disabling itself.
3. Add `.claude/settings.json`. Validate JSON before committing (`jq . .claude/settings.json`).
4. Test each script by hand with sample stdin before trusting it:
   ```bash
   echo '{"tool_input":{"file_path":"lib/equity/slice.ts"}}' | bash .claude/hooks/guard-edit.sh; echo "exit=$?"
   echo '{"tool_input":{"command":"git push -f origin main"}}' | bash .claude/hooks/guard-bash.sh; echo "exit=$?"
   ```
   Both should print BLOCKED and `exit=2`.
5. Open a Claude Code session, run `/hooks` to confirm they loaded, make a deliberate type error, watch it self-correct.
6. PR it. Greptile reviews it like anything else.

## What hooks can't do (and what to use instead)

- **Co-author trailer on manual commits.** Hooks only see what Claude does. Ferenz's hand-written commits need a git `commit-msg` hook (husky or `.githooks/`) that appends `Co-Authored-By: Claude <noreply@anthropic.com>` when a Claude Code session is active, or simply a rule: all commits go through Claude Code's commit flow. Decide which; the GitHub Contributors chart is the check.
- **PR size / branch age.** Enforce in CI: a GitHub Action that fails a PR over 200 changed lines (excluding lockfiles, migrations, docs) or whose branch is older than 24h from first commit.
- **Permission prompts stalling runs.** Not a hook. Add the tools Claude needs every session to `permissions.allow` in the same `settings.json` (e.g. `Bash(npm test:*)`, `Bash(npm run typecheck)`, `Bash(npx supabase *)`, `Bash(git *)`) so runs don't sit waiting for a human to click Allow.

```json
"permissions": {
  "allow": [
    "Bash(npm test*)", "Bash(npm run *)", "Bash(npx tsc*)", "Bash(npx eslint*)",
    "Bash(npx supabase *)", "Bash(npx playwright *)", "Bash(git add*)", "Bash(git commit*)",
    "Bash(git push*)", "Bash(git checkout*)", "Bash(git rebase*)", "Bash(gh pr *)"
  ]
}
```

That last item is very possibly the single largest source of dead time in a session. Ask both devs how often a run is sitting on an Allow prompt when they come back to it.
