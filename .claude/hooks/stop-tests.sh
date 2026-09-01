#!/usr/bin/env bash
# Stop hook. Claude does not end a turn with red tests.
#
# Exit 2 hands the failure back and Claude keeps working. The stop_hook_active
# check prevents an infinite loop -- Claude Code sets that flag on every stop
# attempt after a Stop hook has blocked once, so on the second pass we let the
# turn end and Claude reports the failure rather than grinding.
set -u

command -v jq >/dev/null 2>&1 || {
  echo "BLOCKED: jq is not installed, so .claude/hooks cannot run. Install it: brew install jq" >&2
  exit 2
}

tmpdir=$(mktemp -d) || exit 0
trap 'rm -rf "$tmpdir"' EXIT

input=$(cat)
active=$(echo "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0   # already looped once; let it stop and report

# Only run when something actually changed -- skips pure Q&A turns.
#
# KNOWN GAP, accepted deliberately: if Claude edits, commits AND pushes before
# stopping, the tree is clean and '@{u}..HEAD' is empty, so this exits without
# running anything. CI is the backstop for that path, and it is the path where
# a human is about to look at a PR anyway. The alternative -- running the suite
# on every Stop including pure Q&A turns -- costs ~6s on every single turn.
# Revisit if a red push ever reaches main this way.
#
# '@{u}' is quoted so the shell leaves it alone (git parses it, not bash) and
# so shellcheck does not read the brace as a literal (SC1083). The 2>/dev/null
# makes a branch with no upstream read as "nothing unpushed" rather than error.
if git diff --quiet && git diff --cached --quiet && [ -z "$(git log '@{u}..HEAD' 2>/dev/null)" ]; then
  exit 0
fi

# `npm test` is vitest's default project: unit + component only. It excludes
# tests/isolation/** and tests/e2e/**, so this needs no Docker and cannot touch
# the shared Supabase stack the other stream may be using. That exclusion is
# deliberate -- see vitest.config.mts.
#
# `>file 2>&1`, not the doc's `2>file` -- vitest reports on stdout, so
# capturing stderr alone hands back an empty failure. See check-file.sh.
if ! npm test --silent >"$tmpdir/test.txt" 2>&1; then
  echo "Tests failed. Fix before finishing:" >&2
  tail -60 "$tmpdir/test.txt" >&2
  exit 2
fi
exit 0
