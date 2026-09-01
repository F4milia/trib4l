-- ledger_events -- Ferenz 6.1. The Family's own narrative history.
--
-- THE DISTINCTION THIS FILE EXISTS TO DEFEND, because it is the one a future
-- session is most likely to collapse:
--
--   audit_log      every mutation, enforced by trigger, metadata carries column
--                  NAMES only, never values. A compliance record. Nobody reads
--                  it for pleasure.
--
--   ledger_events  what happened in this Family, in plain language, written
--                  deliberately by application code at moments that matter.
--                  It is what the Keepsake exports. A member reads it.
--
-- F6.1 states the separation outright ("explicitly separate from audit_log")
-- and F3.4 says a Tower pivot writes here "describing what happened in plain
-- language". So this table carries prose on purpose -- which is exactly what
-- audit_log's metadata is forbidden from carrying. They are not two views of
-- one thing.

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- ------------------------------------------------------------------- shape
select has_table('public', 'ledger_events', 'ledger_events exists');
select col_not_null('public', 'ledger_events', 'org_id', 'every event belongs to a Family');
select col_not_null('public', 'ledger_events', 'event_type', 'every event is typed');
select col_not_null('public', 'ledger_events', 'payload', 'payload is never null -- an empty object, not nothing');

select col_type_is('public', 'ledger_events', 'payload', 'jsonb', 'payload is jsonb (F6.1)');

-- F6.1's six types, exactly.
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'ledger_event_type'),
  array['table_entry','brick_complete','build_complete','tower_event','care_action','vow_event'],
  'the six event types from F6.1, in order and no others'
);

select hasnt_column('public', 'ledger_events', 'deleted_at',
  'no soft delete -- the Ledger is the record, and a record you can quietly remove is not one');

select hasnt_column('public', 'ledger_events', 'updated_at',
  'no updated_at either -- append-only, so there is nothing to update');

-- -------------------------------------------------------------------- RLS
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ledger_events'::regclass),
  'row level security is enabled'
);

-- Every member of the Family reads its own history. That is the point of it.
select ok(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'ledger_events'
      and grantee = 'authenticated' and privilege_type = 'SELECT') = 1,
  'members can read their Family history'
);

-- No UPDATE and no DELETE for anyone, ever. Append-only is enforced at the
-- grant layer, not by hoping nobody writes the statement.
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'ledger_events'
      and grantee in ('authenticated', 'service_role')
      and privilege_type in ('UPDATE', 'DELETE')),
  0,
  'nobody can rewrite or erase a Ledger event -- append-only at the grant layer'
);

-- ------------------------------------------------------------------ audit
-- Invariant 5. Yes, the Ledger is itself audited: "every mutation writes to
-- audit_log" has no carve-out for tables that happen to look like logs.
select has_trigger('public', 'ledger_events', 'ledger_events_audit',
  'the audit trigger ships in the same migration as the table');

-- ----------------------------------------------------------------- probes
create temporary table _le as
  select '00000000-0000-0000-0000-00000000000a'::uuid as org_id,
         '00000000-0000-0000-0000-0000000000c1'::uuid as event_id;

insert into public.ledger_events (id, org_id, event_type, payload)
select event_id, org_id, 'tower_event',
       jsonb_build_object('summary', 'The Family paused the Tower for a season.')
  from _le;

select is(
  (select event_type::text from public.ledger_events where id = (select event_id from _le)),
  'tower_event',
  'an event can be written'
);

select is(
  (select payload ->> 'summary' from public.ledger_events where id = (select event_id from _le)),
  'The Family paused the Tower for a season.',
  'the payload holds plain language, which is the whole point (F3.4)'
);

select is(
  (select org_id from public.audit_log
    where target_type = 'ledger_events' and target_id = (select event_id from _le)),
  (select org_id from _le),
  'writing a Ledger event is itself audited against the Family'
);

-- The audit row records that a Ledger event was written; it does NOT copy the
-- prose. This is the assertion that keeps the two tables' jobs apart.
select is(
  (select count(*)::int from public.audit_log
    where target_type = 'ledger_events'
      and target_id = (select event_id from _le)
      and metadata::text like '%paused the Tower%'),
  0,
  'the audit row does not copy the Ledger prose -- column names only'
);

-- Append-only is asserted here as the ABSENCE of the grant (above), not as a
-- refused statement: pgTAP runs as postgres, which bypasses grants entirely, so
-- a throws_ok here would test nothing and pass. The refusal itself is proven in
-- tests/isolation/ledger-events.test.ts, where a real authenticated JWT is
-- subject to the grant.

-- ------------------------------------------------------------ constraints
select throws_ok(
  $$insert into public.ledger_events (org_id, event_type, payload)
    values ('00000000-0000-0000-0000-00000000000a', 'brick_renamed', '{}'::jsonb)$$,
  '22P02',
  null,
  'an event type outside F6.1s six is rejected'
);

select throws_ok(
  $$insert into public.ledger_events (org_id, event_type)
    values ('00000000-0000-0000-0000-00000000000a', 'table_entry')$$,
  '23502',
  null,
  'payload has no default -- an event with no content is a bug, not a row'
);

-- Deleting a Family takes its history with it. The alternative -- orphaned
-- events with a dangling org_id -- is worse: audit_log already keeps the
-- compliance trail of the deletion itself.
select is(
  (select confdeltype from pg_constraint
    where conrelid = 'public.ledger_events'::regclass and contype = 'f'
      and conkey = array[(select attnum from pg_attribute
                           where attrelid = 'public.ledger_events'::regclass
                             and attname = 'org_id')]),
  'c',
  'org_id cascades on delete'
);

select ok(
  (select count(*)::int from pg_indexes
    where tablename = 'ledger_events' and indexdef like '%org_id%created_at%') >= 1,
  'indexed on (org_id, created_at) -- the timeline read is the only read'
);

select * from finish();
rollback;
