-- D2's named edge case, asserted: "A member with claimed Bricks leaves the
-- Family -- their Bricks revert to open, not attributed to a ghost."
--
-- The two paths are tested separately on purpose. Leaving a Family is a SOFT
-- delete (memberships.deleted_at), which is the product path; a HARD delete
-- happens only through account or organization deletion and reaches `bricks`
-- through the composite FK's `set null (assignee)`. A test that exercised only
-- the hard path would have passed against a migration that fixed nothing a
-- member can actually do.

begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- ------------------------------------------------------------------ fixture
-- Distinct id prefix (00d*) from 130's cascade probe (00c*): both files run in
-- the same suite against the same database, and reusing ids across files is
-- how a test starts depending on its neighbours.
create temporary table _f as
select '00000000-0000-0000-0000-0000000000d1'::uuid as org_id,
       '00000000-0000-0000-0000-0000000000d2'::uuid as leaver_id,
       '00000000-0000-0000-0000-0000000000d3'::uuid as stayer_id,
       '00000000-0000-0000-0000-0000000000d4'::uuid as tower_id,
       '00000000-0000-0000-0000-0000000000d5'::uuid as build_id,
       '00000000-0000-0000-0000-0000000000a1'::uuid as leaver_profile,
       '00000000-0000-0000-0000-0000000000a2'::uuid as stayer_profile;

insert into public.organizations (id, slug, name)
select org_id, 'brick-release-probe', 'Release Probe' from _f;

-- Enum literals are cast explicitly here and in the bricks inserts below.
-- INSERT ... SELECT coerces an unknown literal to the target column's type,
-- but a UNION resolves its branches against each other FIRST, so the literals
-- settle as text and the insert then fails with "column is of type
-- membership_role but expression is of type text".
insert into public.memberships (id, org_id, profile_id, role)
select leaver_id, org_id, leaver_profile, 'member'::membership_role from _f
union all
select stayer_id, org_id, stayer_profile, 'org_owner'::membership_role from _f;

insert into public.towers (id, org_id, title)
select tower_id, org_id, 'Release probe goal' from _f;

insert into public.builds (id, tower_id, org_id, type, title)
select build_id, tower_id, org_id, 'custom', 'Release probe build' from _f;

-- One Brick per status the leaver could be holding, plus a Brick belonging to
-- the member who stays, which must not move.
insert into public.bricks (id, build_id, org_id, description, assignee, status)
select '00000000-0000-0000-0000-0000000000e1'::uuid, build_id, org_id, 'in progress', leaver_id, 'in_progress'::brick_status from _f
union all
select '00000000-0000-0000-0000-0000000000e2'::uuid, build_id, org_id, 'needs help', leaver_id, 'needs_help'::brick_status from _f
union all
select '00000000-0000-0000-0000-0000000000e3'::uuid, build_id, org_id, 'awaiting verification', leaver_id, 'pending_verification'::brick_status from _f
union all
select '00000000-0000-0000-0000-0000000000e4'::uuid, build_id, org_id, 'not theirs', stayer_id, 'in_progress'::brick_status from _f;

-- A finished Brick: verified by the OTHER member, which the peer-verification
-- CHECK requires.
insert into public.bricks
  (id, build_id, org_id, description, assignee, verified_by, verified_at, status)
select '00000000-0000-0000-0000-0000000000e5', build_id, org_id, 'finished work',
       leaver_id, stayer_id, now(), 'done' from _f;

-- e3 is at pending_verification with a verifier already recorded. Legal: the
-- done-requires-verification CHECK constrains 'done' only. This is the row that
-- proves the pointer is cleared on release rather than left to poison a later
-- claim.
update public.bricks
   set verified_by = (select stayer_id from _f), verified_at = now()
 where id = '00000000-0000-0000-0000-0000000000e3';

-- =================================================== the guard, before firing
-- Writing deleted_at WITHOUT changing its value. The trigger is declared
-- `update of deleted_at`, so a role change would not fire it at all and would
-- prove nothing about the in-function guard -- exactly the trap CLAUDE.md
-- records for C1's memberships_join_family_channel.
update public.memberships set deleted_at = null
 where id = (select leaver_id from _f);

select is(
  (select status::text from public.bricks where id = '00000000-0000-0000-0000-0000000000e1'),
  'in_progress',
  'a no-op write to deleted_at fires the trigger and releases nothing');

select is(
  (select assignee from public.bricks where id = '00000000-0000-0000-0000-0000000000e1'),
  (select leaver_id from _f),
  'and the assignee is untouched');

-- ==================================================== the soft delete: leaving
update public.memberships set deleted_at = now()
 where id = (select leaver_id from _f);

select is(
  (select status::text from public.bricks where id = '00000000-0000-0000-0000-0000000000e1'),
  'open',
  'an in_progress Brick reverts to open when its holder leaves');
select is(
  (select assignee from public.bricks where id = '00000000-0000-0000-0000-0000000000e1'),
  null,
  'and is attributed to nobody -- not to a ghost');

select is(
  (select status::text from public.bricks where id = '00000000-0000-0000-0000-0000000000e2'),
  'open',
  'a needs_help Brick reverts too');
select is(
  (select assignee from public.bricks where id = '00000000-0000-0000-0000-0000000000e2'),
  null,
  'and is unassigned');

select is(
  (select status::text from public.bricks where id = '00000000-0000-0000-0000-0000000000e3'),
  'open',
  'a pending_verification Brick reverts -- otherwise it could reach done with no contributor');
select is(
  (select verified_by from public.bricks where id = '00000000-0000-0000-0000-0000000000e3'),
  null,
  'and its verifier pointer is cleared, so a later claim by that person is not refused');
select is(
  (select verified_at from public.bricks where id = '00000000-0000-0000-0000-0000000000e3'),
  null,
  'and so is the verification time');

-- The whole point of clearing verified_by above: prove the later claim works.
update public.bricks set assignee = (select stayer_id from _f), status = 'in_progress'
 where id = '00000000-0000-0000-0000-0000000000e3';
select is(
  (select assignee from public.bricks where id = '00000000-0000-0000-0000-0000000000e3'),
  (select stayer_id from _f),
  'the released Brick can be claimed by the member who had verified it');

-- ------------------------------------------------------------ what must NOT move
select is(
  (select status::text from public.bricks where id = '00000000-0000-0000-0000-0000000000e5'),
  'done',
  'a done Brick stays done -- the Ledger and the Keepsake read it');
select is(
  (select assignee from public.bricks where id = '00000000-0000-0000-0000-0000000000e5'),
  (select leaver_id from _f),
  'and keeps its contributor, which is what K1 attributes historical Bricks by');
select is(
  (select verified_at is not null from public.bricks where id = '00000000-0000-0000-0000-0000000000e5'),
  true,
  'and keeps its verification');

select is(
  (select status::text from public.bricks where id = '00000000-0000-0000-0000-0000000000e4'),
  'in_progress',
  'another member''s Brick is not touched');
select is(
  (select assignee from public.bricks where id = '00000000-0000-0000-0000-0000000000e4'),
  (select stayer_id from _f),
  'and keeps its assignee');

-- ================================================== re-activation is not a release
update public.bricks set assignee = (select stayer_id from _f), status = 'in_progress'
 where id = '00000000-0000-0000-0000-0000000000e1';

update public.memberships set deleted_at = null
 where id = (select leaver_id from _f);

select is(
  (select status::text from public.bricks where id = '00000000-0000-0000-0000-0000000000e1'),
  'in_progress',
  'a member rejoining releases nothing -- the transition is one-way');

-- ============================================== unclaiming your own Brick
-- The third way to lose an assignee, and the reason the rule lives on `bricks`
-- rather than only on the departure path.
update public.bricks set assignee = null
 where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select status::text from public.bricks where id = '00000000-0000-0000-0000-0000000000e1'),
  'open',
  'a member unclaiming their own Brick leaves it open, with no second write');

-- ================================================== the hard delete: FK path
-- Account deletion and organization deletion reach bricks this way, through
-- `on delete set null (assignee)` on the composite FK.
update public.bricks set assignee = (select stayer_id from _f), status = 'needs_help'
 where id = '00000000-0000-0000-0000-0000000000e1';

delete from public.memberships where id = (select stayer_id from _f);

select is(
  (select status::text from public.bricks where id = '00000000-0000-0000-0000-0000000000e1'),
  'open',
  'the FK cascade path reverts status too, not just the pointer');
select is(
  (select assignee from public.bricks where id = '00000000-0000-0000-0000-0000000000e1'),
  null,
  'and the pointer is null');
select is(
  (select org_id from public.bricks where id = '00000000-0000-0000-0000-0000000000e1'),
  (select org_id from _f),
  'and org_id survives -- a bare SET NULL on the composite key would have nulled it');

-- ======================================= REGRESSION: the org cascade still works
-- This migration puts a BEFORE UPDATE trigger on `bricks` directly inside the
-- organization-deletion cascade, which took three defects to get green in
-- 20260903100811. Deleting a Family holding a verified done Brick is the shape
-- that found all three.
select lives_ok(
  $$delete from public.organizations
     where id = '00000000-0000-0000-0000-0000000000d1'$$,
  'a Family holding a verified done Brick can still be deleted');

select is(
  (select count(*)::int from public.bricks
    where org_id = '00000000-0000-0000-0000-0000000000d1'),
  0,
  'and its Bricks go with it');

-- =========================================================== audit coverage
-- Invariant 5: these are mutations, so they are logged. The trigger writes
-- through audit_row_change() like any other UPDATE -- this migration adds no
-- app-layer audit call and must not need one.
select ok(
  (select count(*) from public.audit_log
    where action = 'bricks.update'
      and target_id = '00000000-0000-0000-0000-0000000000e1') > 0,
  'the release is in audit_log, by trigger, not by convention');

-- Scoped to this row, not counted globally by action: a global count is
-- order-dependent once another file writes bricks.update (CLAUDE.md,
-- 2026-08-29).
select ok(
  (select count(*) from public.audit_log
    where action = 'memberships.update'
      and target_id = '00000000-0000-0000-0000-0000000000d2') > 0,
  'and so is the departure that caused it');

select * from finish();
rollback;
