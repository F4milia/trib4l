#!/usr/bin/env bash
# PreToolUse on Edit|Write|MultiEdit.
#
# Blocks edits to Ivan-gated paths unless the session was launched with
# IVAN_GATE=1. Backs CLAUDE.md invariant 1 (the slice formula is deterministic)
# and invariant 10 (commerce is dormant, profit-share is not-for-production).
set -u
input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

# GATED PATHS -- VERIFIED AGAINST REAL REPO PATHS 2026-09-02.
#
# docs/claude-code-hooks-setup.md ships a generic list:
#   (lib/equity/|lib/ledger/|supabase/migrations/.*(ledger|equity|slice)|lib/stripe/|app/api/stripe/)
# Measured against `git ls-files`, that matches 2 of the 8 money/ledger files
# here: `lib/stripe/` and `app/api/stripe/` have trailing slashes and this repo
# has `lib/stripe.ts` and `app/api/webhooks/stripe/route.ts`, while lib/equity/
# and lib/ledger/ do not exist yet. An inert guard is indistinguishable from a
# working one -- same lesson as the greptile.json entry in CLAUDE.md
# (2026-08-27).
#
# So: match what exists today, and keep the future directories so the guard is
# already armed when Wave 6/7 creates them.
GATED='(^|/)(lib/(equity|ledger|contribution|ai)/'          # arrives in Wave 6/7
GATED="$GATED"'|lib/(stripe|commerce)\.ts'                  # exists now
GATED="$GATED"'|app/actions/commerce\.ts'                   # exists now
GATED="$GATED"'|app/api/webhooks/stripe/'                   # exists now
GATED="$GATED"'|app/o/\[slug\]/settings/commerce/'          # exists now
GATED="$GATED"'|supabase/(migrations|tests/database)/.*(ledger|equity|slice|contribution)'
GATED="$GATED"')'

if echo "$file" | grep -Eq "$GATED"; then
  if [ "${IVAN_GATE:-0}" != "1" ]; then
    echo "BLOCKED: $file is an Ivan-gated path (equity ledger / commerce / money)." >&2
    echo "Stop and report this to the operator; do not work around it." >&2
    echo "Gated sessions are launched with: IVAN_GATE=1 claude" >&2
    exit 2
  fi
fi
exit 0
