-- bricks -- Ferenz 4.2, plus the lifecycle rules F4.4-F4.7 hang off it.
--
-- The two assertions this file exists for are the peer-verification pair.
-- F4.7 says "any member OTHER THAN the Brick's assignee can confirm it", and
-- a completed Brick is what the Ledger accrues slices from -- so "I marked my
-- own work done" is not a UI bug, it is a wrong cap table. Both rules are
-- CHECK constraints rather than application logic, which is why they are
-- testable here and why no policy edit can loosen them.

begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ------------------------------------------------------------------- shape
select has_table('public', 'bricks', 'bricks exists');
select col_not_null('public', 'bricks', 'build_id', 'a Brick belongs to a Build');
select col_not_null('public', 'bricks', 'org_id', 'a Brick carries its Family');
select col_not_null('public', 'bricks', 'description', 'a Brick says what it is');
select col_is_null('public', 'bricks', 'assignee', 'assignee is null until claimed (F4.2)');
select col_is_null('public', 'bricks', 'due_at', 'not every Brick has a deadline');

-- Named due_at, not due_window. A hard deadline, per the session decision --
-- and a column called "window" holding one instant misleads every reader.
select col_type_is('public', 'bricks', 'due_at', 'timestamp with time zone',
  'due_at is an instant, so F4.5s "exceeds its due_window" is a comparison');
select hasnt_column('public', 'bricks', 'due_window',
  'the misleading name is not carried over');

select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'brick_status'),
  array['open','in_progress','needs_help','pending_verification','done'],
  'F4.2s five states, in order and no others'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.bricks'::regclass),
  'row level security is enabled'
);

select has_trigger('public', 'bricks', 'bricks_audit',
  'the audit trigger ships in the same migration as the table');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'bricks'
      and privilege_type = 'DELETE' and grantee in ('authenticated','service_role')),
  0,
  'nobody can delete a Brick -- the Ledger accrues from completed ones'
);

-- ----------------------------------------------------------------- probes
create temporary table _bk as
  select '00000000-0000-0000-0000-00000000000a'::uuid as org_a,
         '00000000-0000-0000-0000-00000000000b'::uuid as org_b,
         '00000000-0000-0000-0000-0000000000e1'::uuid as tower_a,
         '00000000-0000-0000-0000-0000000000f1'::uuid as build_a,
         '00000000-0000-0000-0000-0000000000f9'::uuid as build_b,
         '00000000-0000-0000-0000-0000000000d5'::uuid as brick_1,
         -- alice and bob are both in caregiver-circle; dave is in wellness-guild
         (select id from public.memberships where org_id = '00000000-0000-0000-0000-00000000000a'
           and profile_id = '00000000-0000-0000-0000-0000000000a1') as alice_m,
         (select id from public.memberships where org_id = '00000000-0000-0000-0000-00000000000a'
           and profile_id = '00000000-0000-0000-0000-0000000000a2') as bob_m,
         (select id from public.memberships where org_id = '00000000-0000-0000-0000-00000000000c'
           and profile_id = '00000000-0000-0000-0000-0000000000a4') as dave_m;

insert into public.towers (id, org_id, title) select tower_a, org_a, 'Open the kitchen' from _bk;
insert into public.builds (id, tower_id, org_id, type, title)
select build_a, tower_a, org_a, 'permanence', 'Fit out the room' from _bk;

insert into public.bricks (id, build_id, org_id, description, due_at)
select brick_1, build_a, org_a, 'Get three quotes for the extractor fan', now() + interval '7 days'
  from _bk;

select is(
  (select status::text from public.bricks where id = (select brick_1 from _bk)),
  'open',
  'a new Brick starts open and unclaimed'
);

select is(
  (select org_id from public.audit_log
    where target_type = 'bricks' and target_id = (select brick_1 from _bk)),
  (select org_a from _bk),
  'creating a Brick is audited against the Family'
);

-- ---------------------------------------------- the claim, and its race
-- F4.4's concurrency guarantee is the shape of this write, not a lock: two
-- simultaneous claims both carry `and assignee is null`, so exactly one
-- affects a row. Proven with two real clients in the isolation suite; here we
-- assert the losing shape returns nothing.
update public.bricks set assignee = (select alice_m from _bk), status = 'in_progress'
 where id = (select brick_1 from _bk) and assignee is null;

select is(
  (select assignee from public.bricks where id = (select brick_1 from _bk)),
  (select alice_m from _bk),
  'the first claim lands'
);

select is(
  (select count(*)::int from public.bricks
    where id = (select brick_1 from _bk) and assignee is null),
  0,
  'a second claim carrying "and assignee is null" matches nothing -- the loser writes nothing'
);

-- --------------------------------------- peer verification, enforced
-- THE TWO ASSERTIONS THIS FILE IS FOR.
select throws_ok(
  format($$update public.bricks
              set verified_by = %L, verified_at = now(), status = 'done'
            where id = '00000000-0000-0000-0000-0000000000d5'$$,
         (select alice_m from _bk)),
  '23514',
  null,
  'the assignee cannot verify their own Brick (F4.7)'
);

-- A verifier with no time is refused. The reverse is allowed on purpose: see
-- the membership-deletion case at the end of this file.
select throws_ok(
  format($$update public.bricks set verified_by = %L
            where id = '00000000-0000-0000-0000-0000000000d5'$$,
         (select bob_m from _bk)),
  '23514',
  null,
  'a verifier cannot be recorded without a verification time'
);

select throws_ok(
  $$update public.bricks set status = 'done'
     where id = '00000000-0000-0000-0000-0000000000d5'$$,
  '23514',
  null,
  'a Brick cannot be done with nobody having verified it'
);

select lives_ok(
  format($$update public.bricks
              set verified_by = %L, verified_at = now(), status = 'done'
            where id = '00000000-0000-0000-0000-0000000000d5'$$,
         (select bob_m from _bk)),
  'another member of the same Family can verify it'
);

-- REGRESSION. `on delete set null` fires an UPDATE, and an UPDATE re-evaluates
-- CHECK constraints -- so while `done` depended on verified_by, deleting the
-- verifier's membership aborted with 23514 and took the whole delete with it.
-- Measured before the fix: an organization holding one verified done Brick
-- could not be deleted at all.
select lives_ok(
  format($$delete from public.memberships where id = %L$$, (select bob_m from _bk)),
  'the verifier can leave the Family -- deleting their membership is not refused'
);

select is(
  (select status::text || ',' || (verified_by is null)::text || ',' ||
          (verified_at is not null)::text
     from public.bricks where id = '00000000-0000-0000-0000-0000000000d5'),
  'done,true,true',
  'the Brick stays done, the pointer clears, and the FACT of verification survives'
);

-- ------------------------------------ nothing may cross Family lines
insert into public.towers (id, org_id, title)
values ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-00000000000b', 'Another goal');
insert into public.builds (id, tower_id, org_id, type, title)
select build_b, '00000000-0000-0000-0000-0000000000e8', org_b, 'custom', 'Elsewhere' from _bk;

select throws_ok(
  $$insert into public.bricks (build_id, org_id, description)
    values ('00000000-0000-0000-0000-0000000000f9',
            '00000000-0000-0000-0000-00000000000a', 'Claiming the wrong Family')$$,
  '23503',
  null,
  'a Brick cannot claim a Family its Build is not in'
);

-- The assignee case is the subtler one: dave is a real member with a valid
-- membership id, and RLS sees nothing wrong with either side on its own.
select throws_ok(
  format($$insert into public.bricks (build_id, org_id, description, assignee)
            values ('00000000-0000-0000-0000-0000000000f1',
                    '00000000-0000-0000-0000-00000000000a', 'Assigned to an outsider', %L)$$,
         (select dave_m from _bk)),
  '23503',
  null,
  'a Brick cannot be assigned to somebody in another Family'
);

-- ------------------- REGRESSION: a Family that finished work can be deleted
-- The shape that found the constraint bug. organizations cascades to BOTH
-- memberships and (through towers and builds) bricks, and Postgres does not
-- promise an order -- so the membership cascade's `set null` reached a done
-- Brick first and the whole delete aborted. A Family that had ever completed
-- a verified Brick could not be deleted.
insert into public.organizations (id, slug, name)
values ('00000000-0000-0000-0000-0000000000c1', 'brick-cascade-probe', 'Cascade Probe');

insert into public.memberships (id, org_id, profile_id, role)
values ('00000000-0000-0000-0000-0000000000c2',
        '00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-0000000000a1', 'org_owner'),
       ('00000000-0000-0000-0000-0000000000c3',
        '00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-0000000000a2', 'member');

insert into public.towers (id, org_id, title)
values ('00000000-0000-0000-0000-0000000000c4',
        '00000000-0000-0000-0000-0000000000c1', 'Probe goal');

insert into public.builds (id, tower_id, org_id, type, title)
values ('00000000-0000-0000-0000-0000000000c5',
        '00000000-0000-0000-0000-0000000000c4',
        '00000000-0000-0000-0000-0000000000c1', 'custom', 'Probe build');

insert into public.bricks
  (id, build_id, org_id, description, assignee, verified_by, verified_at, status)
values ('00000000-0000-0000-0000-0000000000c6',
        '00000000-0000-0000-0000-0000000000c5',
        '00000000-0000-0000-0000-0000000000c1', 'Finished work',
        '00000000-0000-0000-0000-0000000000c2',
        '00000000-0000-0000-0000-0000000000c3', now(), 'done');

-- REGRESSION, and it took two defects to reach green.
--
-- (1) A CHECK over `verified_by` aborted the cascade, because `on delete set
--     null` fires an UPDATE and an UPDATE re-evaluates CHECKs. Fixed here by
--     constraining `verified_at` -- the fact -- instead of the pointer.
-- (2) audit_row_change() then aborted it further down: audit_log_org_id_fkey,
--     because the function pre-checked the org's existence only on DELETE and
--     the membership cascade fires an UPDATE. Fixed on main by 20260903100601
--     (CD-3/CD-4), which inserts and catches foreign_key_violation on any tg_op.
--
-- Kept as an assertion rather than deleted: it is the only place that proves
-- both fixes hold together, and it is the shape a future cascade will break.
select lives_ok(
  $$delete from public.organizations
     where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'a Family holding a verified, completed Brick can be deleted'
);

select is(
  (select count(*)::int from public.bricks
    where id = '00000000-0000-0000-0000-0000000000c6'),
  0,
  'and the Brick goes with it'
);

select * from finish();
rollback;
