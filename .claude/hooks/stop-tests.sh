#!/usr/bin/env bash
# Stop hook. Claude does not end a turn with red tests.
#
# Exit 2 hands the failure back and Claude keeps working. The stop_hook_active
# check prevents an infinite loop -- on the second pass it lets the turn end so
# Claude can report the failure rather than grinding.
set -u
input=$(cat)
active=$(echo "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0   # already looped once; let it stop and report

# Only run when something actually changed -- skips pure Q&A turns.
# `git log @{u}..HEAD` errors when the branch has no upstream, so 2>/dev/null
# makes a fresh branch read as "no unpushed commits" rather than aborting.
if git diff --quiet && git diff --cached --quiet && [ -z "$(git log @{u}..HEAD 2>/dev/null)" ]; then
  exit 0
fi

# `npm test` is vitest's default project: unit + component only. It excludes
# tests/isolation/** and tests/e2e/**, so this needs no Docker and cannot touch
# the shared Supabase stack the other stream may be using. That exclusion is
# deliberate -- see vitest.config.mts.
# `>file 2>&1`, not the doc's `2>file` -- vitest reports on stdout, so
# capturing stderr alone hands back an empty failure. See check-file.sh.
if ! npm test --silent >/tmp/hook-test.txt 2>&1; then
  echo "Tests failed. Fix before finishing:" >&2
  tail -60 /tmp/hook-test.txt >&2
  exit 2
fi
exit 0
