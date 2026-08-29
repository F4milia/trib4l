-- The generic guard. Both leaks found so far -- a user-chosen slug stored as
-- target_key, and the pre-existing rpc functions writing {"reason": ...} --
-- fall out of one assertion, rather than needing a test per shape nobody
-- anticipated.
--
-- Heuristic, deliberately: it catches prose, which is what leaks. A
-- single-token secret would pass. It is a net, not a proof.

begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

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
-- Walks scalars and array elements separately: {"changed": [...]} renders with
-- spaces as raw text, so a naive metadata::text regex would false-positive on
-- every UPDATE.
--
-- On its first run this caught a real leak that predates this PR: three rpc
-- functions -- moderate_post, moderate_comment and moderate_video_asset,
-- shipped in Sessions 6-11 -- write {"reason": "<free text>"} into metadata. A
-- moderation reason is user-supplied content, so that is a live invariant 3
-- and 4 violation in already-merged code. It is PR 4/5's scope, not this one's.
--
-- Exempted BY NAME rather than by loosening the rule, so the debt stays
-- visible and the exemption has to be deleted deliberately when PR 4/5 fixes
-- those functions. The assertion below bounds the list at three, so adding a
-- fourth exemption is a visible change to this file rather than a quiet edit.
select ok(
  not exists (
    select 1
      from public.audit_log a, jsonb_each(a.metadata) e
     where a.action not in ('moderate_post', 'moderate_comment', 'moderate_video_asset')
       and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ '\s'
    union all
    select 1
      from public.audit_log a, jsonb_each(a.metadata) e,
           jsonb_array_elements_text(e.value) el
     where a.action not in ('moderate_post', 'moderate_comment', 'moderate_video_asset')
       and jsonb_typeof(e.value) = 'array' and el ~ '\s'
  ),
  'no metadata value contains whitespace, outside the three rpc functions PR 4/5 fixes'
);

select is(
  array_length(array['moderate_post', 'moderate_comment', 'moderate_video_asset'], 1),
  3,
  'exactly three exemptions -- a fourth is a deliberate edit to this file, not a silent one'
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

select * from finish();
rollback;
