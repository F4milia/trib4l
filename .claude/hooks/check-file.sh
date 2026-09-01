#!/usr/bin/env bash
# PostToolUse on Edit|Write|MultiEdit.
#
# Exit 2 sends stderr back to Claude, which fixes the problem inside the same
# turn instead of surfacing it at PR time. This is the hook that saves the most
# human time.
set -u
input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0
case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Lint just the changed file (fast).
#
# NOTE the redirection: `>file 2>&1`, not the doc's `2>file`. eslint and tsc
# both write their DIAGNOSTICS TO STDOUT and leave stderr empty. Capturing only
# stderr means the hook blocks correctly and then reports nothing -- measured
# 2026-09-02, /tmp/hook-tsc.txt came back 0 bytes on a real TS2322. That
# defeats the whole point, which is handing Claude the error to fix.
if ! npx eslint "$file" >/tmp/hook-eslint.txt 2>&1; then
  echo "ESLint failed on $file:" >&2
  cat /tmp/hook-eslint.txt >&2
  exit 2
fi

# ADAPTED from docs/claude-code-hooks-setup.md, which runs
# `npx tsc --noEmit -p tsconfig.json` directly. This project generates Next.js
# route types, so a bare tsc reports phantom errors on a newly added route.
# `npm run typecheck` is `next typegen && tsc --noEmit` -- the project's own
# gate, and the one CI runs.
#
# Measured 2026-09-02: ~3s warm, ~5s cold. Well under the doc's 30s
# drop-this-step threshold, so the typecheck stays here.
if ! npm run typecheck --silent >/tmp/hook-tsc.txt 2>&1; then
  echo "Typecheck failed after editing $file:" >&2
  head -40 /tmp/hook-tsc.txt >&2
  exit 2
fi
exit 0
