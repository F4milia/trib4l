-- Reverse: drop trigger bricks_release_when_unassigned on bricks; drop trigger
-- memberships_release_bricks on memberships; drop function
-- public.release_brick_when_unassigned(); drop function
-- public.release_bricks_of_departed_member().

-- Schema session, PR 5. D2's named edge case, from the run doc's register:
--
--   "A member with claimed Bricks leaves the Family -- their Bricks revert to
--    open, not attributed to a ghost."
--
-- `bricks` as shipped does NOT satisfy this, in two separate ways, and the
-- second one is why this migration is not a one-liner.
--
-- (1) The composite FK carries `on delete set null (assignee)`, which nulls the
--     POINTER and leaves `status` alone. A claimed Brick became
--     `assignee = null, status = 'in_progress'` -- a Brick nobody holds that is
--     not open, which is precisely the ghost the edge case names. This is the
--     second time a SET NULL on this table has behaved differently from how it
--     reads; the first was 20260903100811's own composite-column bug.
--
-- (2) MORE IMPORTANTLY, that FK never fires when a member leaves. Leaving is a
--     SOFT delete in this codebase: `memberships.deleted_at`, which
--     lib/family-cap.ts:42 filters on to enforce the twelve-member cap. A
--     soft delete is an UPDATE, so `on delete set null` is not involved at all
--     and the Brick keeps both its assignee and its status. Fixing only (1)
--     would have satisfied a pgTAP test that hard-deletes a membership while
--     leaving the actual product path -- a member leaving a Family -- untouched.
--
-- So: one rule, expressed once, reached by both paths.

-- ------------------------------------------------------------------ the rule
-- A Brick with no assignee is not in progress. Enforced on `bricks` rather
-- than in each caller, because there are three ways to lose an assignee
-- (departure, the FK cascade, and a member unclaiming their own Brick) and a
-- rule owned by the table cannot be reached around by the next writer.
--
-- Not a CHECK constraint, deliberately: a CHECK could only REFUSE the state,
-- and refusing is wrong here -- the membership cascade must be free to null the
-- pointer. This has to CORRECT the row, which is a trigger's job. It is also
-- the lesson of 20260903100811 read forwards: a CHECK over a column another
-- table's FK action can null aborts the parent delete.
create or replace function public.release_brick_when_unassigned()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  -- Only the transition, and only downward. A Brick that never had an assignee
  -- is already open; one that still has an assignee is somebody's work.
  if old.assignee is null or new.assignee is not null then
    return new;
  end if;

  -- 'done' is history and stays history. The Ledger accrues from completed
  -- Bricks and the Keepsake exports them (K1's edge case is precisely "a Tower
  -- whose contributor left mid-Build -- attribute their historical Bricks
  -- correctly"), so reverting a finished Brick would rewrite the record. The
  -- verification survived its verifier leaving for the same reason
  -- (20260903100811's verified_at/verified_by split); the completion survives
  -- its author leaving.
  if new.status = 'done' then
    return new;
  end if;

  new.status := 'open';

  -- ASSUMPTION, stated because the prompt does not specify it: a Brick sitting
  -- at 'pending_verification' also reverts. It reads harsh -- the work was
  -- submitted -- but the alternative is worse. `bricks_verifier_is_not_assignee`
  -- is satisfiable by anyone once the assignee is null, so an unowned Brick
  -- could be verified through to 'done' with no contributor at all, and the
  -- Ledger would accrue that completion to nobody. Reverting loses a claim;
  -- not reverting loses a contributor from the equity record.
  --
  -- And the verification pointer clears with it, which is NOT a contradiction
  -- of "a verification is a historical event". That principle protects a
  -- COMPLETED Brick. Here the work cycle was abandoned, and leaving verified_by
  -- set on an open Brick plants a live bug: if that same person later claims
  -- it, verified_by = assignee and bricks_verifier_is_not_assignee refuses the
  -- claim with a constraint error nobody could explain.
  new.verified_by := null;
  new.verified_at := null;

  return new;
end;
$$;

revoke execute on function public.release_brick_when_unassigned() from public;

create trigger bricks_release_when_unassigned
  before update on bricks
  for each row execute function public.release_brick_when_unassigned();

-- ------------------------------------------------------- the departure path
-- Nulls the pointer when a membership is soft-deleted; the trigger above turns
-- that into the status change. Two triggers rather than one because they are
-- two different facts: "this member is gone" belongs to memberships, and "an
-- unassigned Brick is open" belongs to bricks.
create or replace function public.release_bricks_of_departed_member()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  -- Only the null -> not null transition. Re-activating a member
  -- (not null -> null) must not touch anything, and re-soft-deleting an
  -- already-departed member has nothing to release.
  if old.deleted_at is not null or new.deleted_at is null then
    return null;
  end if;

  -- 'done' excluded here as well as in the trigger above. Filtering here too
  -- means the UPDATE does not touch rows it would not change, which keeps this
  -- off the write path of every completed Brick in the Family.
  update public.bricks
     set assignee = null
   where assignee = old.id
     and status <> 'done';

  return null;
end;
$$;

revoke execute on function public.release_bricks_of_departed_member() from public;

-- `update of deleted_at` narrows the fire condition, matching
-- memberships_join_family_channel from C1's 20260903100703. Note the trap
-- recorded in CLAUDE.md for that trigger: the column list means a role-only
-- UPDATE never fires this at all, so the in-function guard above is NOT
-- exercised by changing the role. tests/database/140 writes deleted_at without
-- changing its value to reach it.
create trigger memberships_release_bricks
  after update of deleted_at on memberships
  for each row execute function public.release_bricks_of_departed_member();
