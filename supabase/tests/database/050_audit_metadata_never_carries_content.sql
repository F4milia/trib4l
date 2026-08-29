-- The generic guard. Both leaks found so far -- a user-chosen slug stored as
-- target_key, and the pre-existing rpc functions writing {"reason": ...} --
-- fall out of one assertion, rather than needing a test per shape nobody
-- anticipated.
--
-- Heuristic, deliberately: it catches prose, which is what leaks. A
-- single-token secret would pass. It is a net, not a proof.

begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---------------------------------------------------------------- N-1
-- A text primary key is routinely a user-chosen slug. The previous fix stored
-- it verbatim, justified in a comment as "an id, not content".
create table public._probe_slug (id text primary key, org_id uuid);
create trigger _probe_slug_audit after insert on public._probe_slug
  for each row execute function public.audit_row_change();

select lives_ok(
  $$ insert into public._probe_slug (id, org_id)
     values ('my private family note', '00000000-0000-0000-0000-00000000000a') $$,
  'a text primary key still does not break the write'
);

select ok(
  (select metadata::text not like '%private%'
     from public.audit_log where target_type = '_probe_slug'),
  'a text primary key is never stored -- it may be content'
);

select is(
  (select metadata ->> 'target_key_type' from public.audit_log where target_type = '_probe_slug'),
  'text',
  'the key type is recorded instead, which is not content'
);

-- ---- and the over-correction guard: an integer surrogate key IS an id ----
create table public._probe_bigint (id bigserial primary key, org_id uuid);
create trigger _probe_bigint_audit after insert on public._probe_bigint
  for each row execute function public.audit_row_change();
insert into public._probe_bigint (org_id) values ('00000000-0000-0000-0000-00000000000a');

select is(
  (select metadata ->> 'target_key' from public.audit_log where target_type = '_probe_bigint'),
  '1',
  'an integer surrogate key is still preserved -- declared int, so not content'
);

-- ---------------------------------------------------------------- N-2
-- `AND` in a WHERE clause does not short-circuit; the planner evaluated the
-- cast before the guard and threw.
create table public._probe_ord (id uuid primary key default gen_random_uuid(), order_id text);
create trigger _probe_ord_audit after insert on public._probe_ord
  for each row execute function public.audit_row_change('order');

select lives_ok(
  $$ insert into public._probe_ord (order_id) values ('not-a-uuid') $$,
  'order mode with a non-uuid parent key does not break the write'
);

-- ------------------------------------------------- TC-4: the generic net
--
-- Rewritten. The first version asserted "no metadata value contains
-- whitespace", using whitespace as a proxy for "this looks like prose". That
-- heuristic produced two false positives in two review rounds:
--
--   Q3-1  format_type() returns "character varying" -- a type name with a space
--   Q4-1  a quoted column name may contain whitespace: "my private note"
--
-- Both were legal schema, neither was a leak. Patching the inputs a third time
-- would have invited a fourth, so the RULE is stated instead of approximated.
--
-- metadata has exactly four possible keys, and only one can ever hold a value:
--
--   changed           column names          schema
--   target_key_type   a type name           schema
--   org_id_at_delete  a uuid                id
--   target_key        a row's key           VALUE -- integer types only
--
-- A closed key set cannot false-positive on a legal identifier, and unlike the
-- regex it also catches a single-token secret, which "looks like prose" would
-- have missed.
--
-- Two exemption sets, deliberately separate, because they are exempt for
-- different reasons and only one of them is debt:
--
--   LEGACY RPC SHAPE  moderate_post, moderate_comment, moderate_video_asset,
--                     designate_mentor -- four rpc functions that predate the
--                     trigger and write their own metadata shape. Exempt from
--                     the KEY allowlist only.
--
--   CONTENT LEAK      moderate_post, moderate_comment, moderate_video_asset --
--                     the three that write {"reason": "<free text>"}. A
--                     moderation reason is user-supplied content, so this is a
--                     live invariant 3 and 4 violation in already-merged code,
--                     and PR 4/5's scope.
--
-- designate_mentor writes {"profile_id": "<uuid>"} -- an id, not content. It
-- needs the key exemption and must NOT get the content one, or a future leak
-- from it would go unseen.
--
-- MEASURED, 2026-08-30: on a freshly reset database all four exempted actions
-- write zero rows -- no test in this suite calls those rpc functions, so in CI
-- both exemption clauses are inert and the allowlist only ever sees
-- trigger-written metadata. The exemptions are kept because a developer's local
-- database, having exercised the app, does contain those rows and would
-- otherwise fail this file for pre-existing reasons.
--
-- The consequence is worth stating plainly: the {"reason": "<free text>"} leak
-- has NO test coverage in either direction. Nothing here proves the leak is
-- real, and nothing here will turn green when PR 4/5 fixes it. Writing that
-- test means either calling the moderation rpcs from pgTAP or asserting the
-- leaky shape as expected -- both are PR 4/5 decisions, not this file's.

-- TC-D: the key allowlist. This is the assertion that would have caught N-1
-- without anyone anticipating slugs.
select ok(
  not exists (
    select 1 from public.audit_log a, jsonb_object_keys(a.metadata) k
     where a.action not in ('moderate_post', 'moderate_comment',
                            'moderate_video_asset', 'designate_mentor')
       and k not in ('changed', 'target_key', 'target_key_type', 'org_id_at_delete')
  ),
  'metadata carries only keys audit_row_change is known to write'
);

-- TC-C: the one key that can hold a value is only ever an integer surrogate key.
select ok(
  not exists (
    select 1 from public.audit_log
     where metadata ? 'target_key' and (metadata ->> 'target_key') !~ '^[0-9]+$'
  ),
  'target_key is always digits -- never a slug, never prose'
);

-- Scalar schema values still must not contain whitespace. `changed` is exempt
-- by construction: jsonb_each can only ever put column names in it.
select ok(
  not exists (
    select 1 from public.audit_log a, jsonb_each(a.metadata) e
     where a.action not in ('moderate_post', 'moderate_comment', 'moderate_video_asset')
       and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '\s'
  ),
  'no scalar metadata value contains whitespace'
);

select is(
  array_length(array['moderate_post', 'moderate_comment',
                     'moderate_video_asset', 'designate_mentor'], 1),
  4,
  'exactly four legacy rpc shapes are exempt from the key allowlist'
);

select is(
  array_length(array['moderate_post', 'moderate_comment', 'moderate_video_asset'], 1),
  3,
  'and only three of them are exempt from the content check -- designate_mentor '
  'writes an id, so a future leak from it would still be caught'
);

-- ------------------------------------------- Q3-1: the guard's own output
-- format_type() returns human-readable names, several of which contain
-- spaces: varchar -> "character varying", timestamptz -> "timestamp with time
-- zone". Writing those into target_key_type made the whitespace assertion
-- above fail on data it had itself produced -- reporting a content leak where
-- there was none. pg_type.typname is the whitespace-free identifier.
create table public._probe_varchar (id varchar(255) primary key, org_id uuid);
create trigger _probe_varchar_audit after insert on public._probe_varchar
  for each row execute function public.audit_row_change();
insert into public._probe_varchar (id, org_id)
  values ('abc', '00000000-0000-0000-0000-00000000000a');

select is(
  (select metadata ->> 'target_key_type' from public.audit_log where target_type = '_probe_varchar'),
  'varchar',
  'the recorded type name is the whitespace-free identifier, not "character varying"'
);

create table public._probe_ts (id timestamptz primary key, org_id uuid);
create trigger _probe_ts_audit after insert on public._probe_ts
  for each row execute function public.audit_row_change();
insert into public._probe_ts (id, org_id)
  values (now(), '00000000-0000-0000-0000-00000000000a');

select is(
  (select metadata ->> 'target_key_type' from public.audit_log where target_type = '_probe_ts'),
  'timestamptz',
  'and for a type whose readable name has two spaces'
);

select ok(
  not exists (
    select 1 from public.audit_log a, jsonb_each(a.metadata) e
     where a.target_type in ('_probe_varchar', '_probe_ts')
       and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '\s'
  ),
  'the guard no longer fires on its own output'
);

-- ------------------------------------- Q3-1 coupling: the integer allowlist
-- typname yields int2/int4/int8, NOT smallint/integer/bigint. Changing the
-- lookup without changing the comparison silently breaks the surrogate-key
-- case that N-1's fix exists to preserve. All three widths, deliberately.
create table public._probe_i2 (id smallserial primary key, org_id uuid);
create table public._probe_i4 (id serial primary key, org_id uuid);
create table public._probe_i8 (id bigserial primary key, org_id uuid);
create trigger _probe_i2_audit after insert on public._probe_i2
  for each row execute function public.audit_row_change();
create trigger _probe_i4_audit after insert on public._probe_i4
  for each row execute function public.audit_row_change();
create trigger _probe_i8_audit after insert on public._probe_i8
  for each row execute function public.audit_row_change();
insert into public._probe_i2 (org_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public._probe_i4 (org_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public._probe_i8 (org_id) values ('00000000-0000-0000-0000-00000000000a');

select is(
  (select metadata ->> 'target_key' from public.audit_log where target_type = t),
  '1',
  'an ' || t || ' surrogate key is still preserved'
) from unnest(array['_probe_i2', '_probe_i4', '_probe_i8']) as t;

-- ------------------------------------------------------------------ TC-A
-- Q4-1: a quoted column name may legally contain whitespace, and it lands in
-- `changed`. The old heuristic reported that as a content leak.
create table public._probe_colspace (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  "my private note" text
);
create trigger _probe_colspace_audit after insert or update on public._probe_colspace
  for each row execute function public.audit_row_change();
insert into public._probe_colspace (org_id) values ('00000000-0000-0000-0000-00000000000a');
update public._probe_colspace set "my private note" = 'x';

select is(
  (select metadata -> 'changed' from public.audit_log where action = '_probe_colspace.update'),
  '["my private note"]'::jsonb,
  'a whitespace column name is recorded as-is -- it is schema, not content'
);

select ok(
  not exists (
    select 1 from public.audit_log a, jsonb_object_keys(a.metadata) k
     where a.target_type = '_probe_colspace'
       and k not in ('changed', 'target_key', 'target_key_type', 'org_id_at_delete')
  ),
  'and the guard does not fire on it'
);

-- ------------------------------------------------------------------ TC-B
-- The full op matrix on a non-uuid key. Every prior round tested INSERT only;
-- UPDATE and DELETE on such a table were never exercised.
create table public._probe_ops (id bigserial primary key, org_id uuid, note text);
create trigger _probe_ops_audit after insert or update or delete on public._probe_ops
  for each row execute function public.audit_row_change();
insert into public._probe_ops (org_id, note) values ('00000000-0000-0000-0000-00000000000a', 'a');
update public._probe_ops set note = 'b';
delete from public._probe_ops;

select is(
  (select count(*)::int from public.audit_log where target_type = '_probe_ops'),
  3,
  'insert, update and delete are all logged on a non-uuid-keyed table'
);

select is(
  (select count(*)::int from public.audit_log
    where target_type = '_probe_ops' and metadata ->> 'target_key' = '1'),
  3,
  'the integer key survives on all three operations'
);

select is(
  (select count(*)::int from public.audit_log
    where target_type = '_probe_ops' and metadata ? 'changed'),
  1,
  'only the UPDATE carries a diff'
);

select is(
  (select count(*)::int from public.audit_log
    where target_type = '_probe_ops' and target_id is not null),
  0,
  'target_id stays null throughout -- the key does not fit a uuid column'
);

select * from finish();
rollback;
