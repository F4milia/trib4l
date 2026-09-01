#!/usr/bin/env bash
# PreToolUse on Bash. Blocks destructive shell.
set -u

# Fail CLOSED: a guard that cannot parse its input must not wave the command
# through. Without jq this script would read an empty command and exit 0,
# silently disabling every rule below.
command -v jq >/dev/null 2>&1 || {
  echo "BLOCKED: jq is not installed, so this guard cannot inspect the command. Install it: brew install jq" >&2
  exit 2
}

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

deny() { echo "BLOCKED: $1" >&2; exit 2; }

# --- From docs/claude-code-hooks-setup.md, unchanged -------------------------
# Note `--force-with-lease` deliberately still passes: the pattern requires a
# space or end-of-line after --force, and "-with-lease" is neither. Lease-checked
# force-push is the safe form and is how a rebased branch is re-pushed here.
echo "$cmd" | grep -Eq 'git push.*(--force|-f)( |$)'            && deny "force push (use --force-with-lease)"
echo "$cmd" | grep -Eq 'git push.*[ :]main( |$)'                && deny "direct push to main -- open a PR"
echo "$cmd" | grep -Eq 'supabase db (reset|push).*--linked'     && deny "db reset/push against a linked (remote) project"
echo "$cmd" | grep -Eq 'rm -rf (/|~|\.\.|\$HOME)'               && deny "rm -rf on a root/home path"
echo "$cmd" | grep -Eq 'git checkout .* -- \.$|git reset --hard' && deny "discarding working tree"

# --- ADDED for this repo, from CLAUDE.md's Learned constraints ---------------

# 2026-09-01: the git stash stack is SHARED across all worktrees and other
# Claude sessions may push or pop it concurrently. A bare stash/pop can carry
# off, or restore, another session's work. Tagged push/apply is still allowed.
echo "$cmd" | grep -Eq '^[[:space:]]*git stash[[:space:]]*$'    && deny "bare 'git stash' -- the stash stack is shared across worktrees. Use a WIP commit, or 'git stash push -u -m <tag>'"
echo "$cmd" | grep -Eq 'git stash (pop|drop)([[:space:]]|$)'    && deny "'git stash pop/drop' -- the stash stack is shared across worktrees. Use 'git stash apply <sha>' after finding your entry by tag"

# 2026-08-30 and 2026-09-01 (four collisions in one session): both stream
# worktrees point at the ONE local stack (supabase_db_Trib4l). A reset there
# destroys the other stream's database mid-run and presents as flaky tests.
#
# NO EXCEPTION for scripts/schema-sandbox.sh, and that is deliberate. An earlier
# version allowed the command through when the string "schema-sandbox" appeared
# anywhere in it, which `supabase db reset; echo schema-sandbox` satisfies while
# still resetting the shared database. The exception is also unnecessary: this
# hook sees the command Claude runs, so `./scripts/schema-sandbox.sh all` is
# matched as that script invocation, never as the `supabase db reset` inside it.
echo "$cmd" | grep -Eq '(^|[^-])supabase db reset'              && deny "'supabase db reset' targets the SHARED local stack, which the other stream may be using. Use ./scripts/schema-sandbox.sh instead, or confirm with the operator that the other stream is idle"

exit 0
