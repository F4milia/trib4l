#!/usr/bin/env bash
#
# schema-sandbox.sh -- apply and test this repo's migrations in a Postgres
# container that is NOT the shared local Supabase stack.
#
# WHY THIS EXISTS
# ---------------
# `npm run test:isolation` and `npx supabase db reset` both destroy
# `supabase_db_Trib4l`, and BOTH stream worktrees point at that one stack (see
# CLAUDE.md, 2026-08-30 and 2026-09-01). One stream's schema gate silently
# wipes the other stream's database mid-run, and it presents as flaky tests
# rather than as a collision -- it has happened four times.
#
# This script gives a Stream B schema session its own cluster on its own port,
# so migrations and pgTAP can run at any time without asking whether Stream A
# is mid-flight. It is a stand-in for `supabase db reset` at the SCHEMA layer
# only: same image, same roles, same auth schema, same search_path, same pgTAP.
#
# WHAT IT IS NOT
# --------------
# There is no GoTrue, PostgREST, Realtime or Storage here. So it cannot run
# `tests/isolation/**` -- those authenticate as real users with their own JWTs
# through the Data API, which is the whole point of them (CLAUDE.md's testing
# rules). RLS still cannot be proven here: pgTAP connects as `postgres` and
# bypasses policy entirely. Green here means "the schema applies and its pgTAP
# assertions hold", never "RLS is correct".
#
# USAGE
#   scripts/schema-sandbox.sh all      # reset + migrate + seed + test
#   scripts/schema-sandbox.sh reset    # fresh cluster, nothing applied
#   scripts/schema-sandbox.sh migrate  # apply supabase/migrations in order
#   scripts/schema-sandbox.sh seed     # apply supabase/seed.sql
#   scripts/schema-sandbox.sh test     # run supabase/tests/database/*.sql
#   scripts/schema-sandbox.sh psql     # interactive shell
#   scripts/schema-sandbox.sh down     # remove the container

set -euo pipefail

CONTAINER="f4milia_streamb_verify"
PORT="54432"
IMAGE="public.ecr.aws/supabase/postgres:17.6.1.159"

# The shared stack, named so this script can refuse to touch it. If the two
# ever collide the failure must be loud, not a wiped database.
FORBIDDEN="supabase_db_Trib4l"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$CONTAINER" = "$FORBIDDEN" ]; then
  echo "refusing: CONTAINER is the shared Supabase stack" >&2
  exit 1
fi

psql_q() { docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

# `pg_isready` ALONE IS NOT ENOUGH, and the failure is silent and confusing.
# initdb runs a TEMPORARY server on the same Unix socket to execute the image's
# bootstrap scripts, so pg_isready answers yes, then that server shuts down and
# the real one starts. A migration run that begins in the gap dies partway with
# `connection to server on socket ... failed: No such file or directory` --
# which reads like a container that never started rather than one that started
# twice. So: wait for the image's own init-complete line first, and only then
# ask pg_isready. On an already-created container the line is in the log
# history, so this is also correct for `up` on a stopped container.
wait_ready() {
  local i
  for i in $(seq 1 90); do
    if docker logs "$CONTAINER" 2>&1 | grep -q 'init process complete'; then break; fi
    sleep 1
  done
  for i in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U postgres -q 2>/dev/null; then return 0; fi
    sleep 1
  done
  echo "timed out waiting for $CONTAINER" >&2
  exit 1
}

cmd_up() {
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    docker start "$CONTAINER" >/dev/null 2>&1 || true
  else
    docker run -d --name "$CONTAINER" \
      -e POSTGRES_PASSWORD=postgres -e POSTGRES_HOST_AUTH_METHOD=trust \
      -p "${PORT}:5432" "$IMAGE" >/dev/null
  fi
  wait_ready
  echo "sandbox up: $CONTAINER on localhost:$PORT"
}

cmd_down() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  echo "sandbox removed: $CONTAINER"
}

# A fresh cluster rather than `drop schema public cascade`: migrations touch
# auth, extensions and roles too, and a partial teardown is how a sandbox
# starts quietly disagreeing with `db reset`.
cmd_reset() { cmd_down; cmd_up; }

# Two files, two roles, and the ORDER MATTERS: default privileges apply at
# CREATE time, so the grants file has to land before the first migration or it
# has no effect on anything already created.
#
# The grants file runs as postgres, because `alter default privileges for role
# postgres` may only be issued by that role or a superuser.
#
# The auth file runs as supabase_auth_admin: the auth schema is owned by
# supabase_admin and auth.users by supabase_auth_admin, so postgres gets
# `permission denied for schema auth`. Checked against the real stack --
# auth.jwt() and auth.uid() are both owned by supabase_auth_admin there, with
# EXECUTE to PUBLIC, which is what creating them as this role reproduces.
#
# That one goes over TCP (-h 127.0.0.1) rather than the Unix socket: the socket
# is peer-authenticated and there is no supabase_auth_admin OS user, so a
# socket connection fails with `Peer authentication failed`.
# POSTGRES_HOST_AUTH_METHOD=trust covers host connections only.
cmd_bootstrap() {
  psql_q -f - < "$ROOT/scripts/sandbox-bootstrap-grants.sql" >/dev/null
  docker exec -i "$CONTAINER" psql -h 127.0.0.1 -U supabase_auth_admin -d postgres \
    -v ON_ERROR_STOP=1 -q -f - < "$ROOT/scripts/sandbox-bootstrap-auth.sql" >/dev/null
  echo "bootstrap applied (default privileges, then auth)"
}

cmd_migrate() {
  local f count=0
  for f in "$ROOT"/supabase/migrations/*.sql; do
    if ! psql_q -f - < "$f" >/dev/null 2>/tmp/sandbox_err; then
      echo "FAILED: $(basename "$f")" >&2
      cat /tmp/sandbox_err >&2
      exit 1
    fi
    count=$((count + 1))
  done
  echo "applied $count migrations"
}

cmd_seed() {
  if [ -f "$ROOT/supabase/seed.sql" ]; then
    psql_q -f - < "$ROOT/supabase/seed.sql" >/dev/null
    echo "seed applied"
  fi
}

# pgTAP through psql rather than pg_prove, which is not installed here. Each
# test file carries its own begin/plan/finish/rollback, so the parse only has
# to count TAP lines and trust `finish()` to emit the diagnostics.
cmd_test() {
  local f name out ok notok files=0 total_ok=0 total_notok=0
  local failed=()
  for f in "$ROOT"/supabase/tests/database/*.sql; do
    name="$(basename "$f")"
    out="$(docker exec -i "$CONTAINER" psql -U postgres -tA -q -f - < "$f" 2>&1 || true)"
    ok="$(printf '%s\n' "$out" | grep -c '^ok ' || true)"
    notok="$(printf '%s\n' "$out" | grep -c '^not ok ' || true)"
    # THE PLANNED COUNT IS THE ONLY HONEST DENOMINATOR. A pgTAP file dies whole:
    # one bad statement aborts the transaction and every assertion after it
    # emits `current transaction is aborted` -- neither `ok` nor `not ok`. So a
    # file that ran 10 of its 20 assertions and then died reports 10 ok, 0 not
    # ok, and reads as PASS. Measured: seeding a Tower into a Family that
    # 110_towers assumed was empty truncated it 20 -> 10 and this script called
    # it green. Compare against `1..N` instead.
    planned="$(printf '%s\n' "$out" | sed -n 's/^1\.\.\([0-9]*\)$/\1/p' | head -1)"
    planned="${planned:-0}"
    files=$((files + 1))
    total_ok=$((total_ok + ok))
    total_notok=$((total_notok + notok))
    if [ "$notok" -gt 0 ] || [ "$ok" -eq 0 ] || [ "$((ok + notok))" -ne "$planned" ]; then
      failed+=("$name")
      printf '  FAIL  %-52s %3s ok  %3s not ok  (planned %s)\n' "$name" "$ok" "$notok" "$planned"
      printf '%s\n' "$out" | grep -E '^not ok |^# |ERROR' | head -20 | sed 's/^/        /'
    else
      printf '  ok    %-52s %3s ok\n' "$name" "$ok"
    fi
  done
  echo
  # The failing-FILE count is reported alongside the assertion counts, because
  # a file that aborts before its first assertion contributes 0 ok AND 0 not ok
  # -- so "N pass / 0 fail" was printed for a run that had a broken file in it.
  # A pgTAP file dies whole: one bad statement aborts the transaction and every
  # later assertion reports `current transaction is aborted` rather than
  # `not ok`. Counting only "not ok" therefore misses the worst case entirely.
  if [ "${#failed[@]}" -gt 0 ]; then
    echo "$total_ok pass / $total_notok not-ok / ${#failed[@]} of $files FILES FAILING"
    echo "failing files: ${failed[*]}" >&2
    exit 1
  fi
  echo "$total_ok pass / $total_notok fail / $files files"
}

cmd_psql() { docker exec -it "$CONTAINER" psql -U postgres; }

case "${1:-all}" in
  up)        cmd_up ;;
  down)      cmd_down ;;
  reset)     cmd_reset ;;
  bootstrap) cmd_bootstrap ;;
  migrate)   cmd_migrate ;;
  seed)      cmd_seed ;;
  test)      cmd_test ;;
  psql)      cmd_psql ;;
  all)       cmd_reset; cmd_bootstrap; cmd_migrate; cmd_seed; cmd_test ;;
  *)         echo "usage: $0 {all|up|down|reset|bootstrap|migrate|seed|test|psql}" >&2; exit 1 ;;
esac
