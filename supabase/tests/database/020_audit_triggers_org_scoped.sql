-- PR 2/5. Asserts the audit trigger is attached to all 25 org-scoped tables,
-- and that it actually fires -- existence and behaviour, because a trigger can
-- exist and still be attached to the wrong events.

begin;
create extension if not exists pgtap with schema extensions;

-- 25 has_trigger + 5 trigger-shape + 5 behaviour
select plan(35);

-- ------------------------------------------------------- attached everywhere
select has_trigger('public', t, t || '_audit', 'audit trigger on ' || t)
  from unnest(array[
    'cohort_members','cohorts','comments','connected_accounts','invitations',
    'live_stream_credentials','live_streams','meetup_attendance','meetup_rsvps',
    'meetup_series','meetups','member_blocks','member_reports','member_stages',
    'memberships','mentor_pairings','orders','org_profiles','posts','products',
    'reactions','reports','stage_transitions','stages','video_assets'
  ]) as t;

-- --------------------------------------------------- fires on all three events
-- Was "exactly 25 triggers exist", which was a claim about PR 2/5's world and
-- stopped being true when PR 3/5 added five more. Not weakened: made specific,
-- so it asserts these 25 tables are wired to THIS function rather than counting
-- globally. The whole-database total is asserted in 030.
select is(
  (select count(*)::int
     from pg_trigger t
     join pg_proc p on p.oid = t.tgfoid
     join pg_class c on c.oid = t.tgrelid
    where p.proname = 'audit_row_change' and not t.tgisinternal
      and c.relname = any (array[
        'cohort_members','cohorts','comments','connected_accounts','invitations',
        'live_stream_credentials','live_streams','meetup_attendance','meetup_rsvps',
        'meetup_series','meetups','member_blocks','member_reports','member_stages',
        'memberships','mentor_pairings','orders','org_profiles','posts','products',
        'reactions','reports','stage_transitions','stages','video_assets'
      ])),
  25,
  'all 25 org-scoped tables are wired to audit_row_change, one trigger each'
);

select ok(
  (select bool_and((t.tgtype & 4) > 0 and (t.tgtype & 8) > 0 and (t.tgtype & 16) > 0)
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where p.proname = 'audit_row_change' and not t.tgisinternal),
  'every trigger covers INSERT, DELETE and UPDATE'
);

select ok(
  (select bool_and((t.tgtype & 1) > 0)
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where p.proname = 'audit_row_change' and not t.tgisinternal),
  'every trigger is FOR EACH ROW, not statement-level'
);

select ok(
  (select bool_and((t.tgtype & 2) = 0)
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where p.proname = 'audit_row_change' and not t.tgisinternal),
  'every trigger is AFTER, not BEFORE -- the row must be committed to describe it'
);

-- audit_log must never audit itself, even though the function guards it too.
select is(
  (select count(*)::int from pg_trigger t
     join pg_proc p on p.oid = t.tgfoid
     join pg_class c on c.oid = t.tgrelid
    where p.proname = 'audit_row_change' and c.relname = 'audit_log'),
  0,
  'audit_log carries no audit trigger'
);

-- ------------------------------------------------------------------ behaviour
-- Every assertion below is scoped to this one row's id. Counting by action
-- alone was order-dependent: the isolation suite leaves real cohorts.insert
-- rows behind, so `count(*) = 1` passed alone and failed after it ran.
create temporary table _seed as
  select '00000000-0000-0000-0000-00000000000a'::uuid as org_id,
         gen_random_uuid() as cohort_id;

insert into public.cohorts (id, org_id, name)
select cohort_id, org_id, 'audit probe' from _seed;

select is(
  (select count(*)::int from public.audit_log
    where action = 'cohorts.insert' and target_id = (select cohort_id from _seed)),
  1,
  'a real INSERT on a real table writes exactly one row for that row'
);

select is(
  (select org_id from public.audit_log
    where action = 'cohorts.insert' and target_id = (select cohort_id from _seed)),
  (select org_id from _seed),
  'org_id is carried from the row, so the log is Family-scoped'
);

update public.cohorts set name = 'audit probe renamed'
 where id = (select cohort_id from _seed);

select is(
  (select metadata -> 'changed' from public.audit_log
    where action = 'cohorts.update' and target_id = (select cohort_id from _seed)),
  '["name"]'::jsonb,
  'UPDATE records the changed column name only'
);

select ok(
  (select metadata::text not like '%renamed%' from public.audit_log
    where action = 'cohorts.update' and target_id = (select cohort_id from _seed)),
  'the new value never reaches metadata (invariants 3 and 4)'
);

delete from public.cohorts where id = (select cohort_id from _seed);

select is(
  (select count(*)::int from public.audit_log
    where action = 'cohorts.delete' and target_id = (select cohort_id from _seed)),
  1,
  'DELETE writes one row, after the row is gone'
);

select * from finish();
rollback;
