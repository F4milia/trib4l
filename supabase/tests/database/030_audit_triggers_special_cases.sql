-- PR 3/5. The five tables PR 2/5 could not cover, because none carries a
-- usable org_id on the row:
--
--   organizations   -- its org_id IS its own id
--   order_items     -- derived through the parent order
--   blocks          -- platform-wide, genuinely org-less
--   platform_staff  -- platform-level
--   profiles        -- user-level
--
-- Resolution mode is passed as a trigger argument rather than branching on
-- table name inside the function, so the function stays generic and each
-- trigger declares its own intent at the point of attachment.

begin;
create extension if not exists pgtap with schema extensions;

-- 5 has_trigger + 1 total + 1 census + 1 mode arg + 2 organizations/order_items
-- org_id + 1 order_items count + 2 profiles + 2 no-op pair + 2 platform_staff
-- + 1 unknown-mode raise
select plan(22);  -- +4: deleting an organization, and its cascade; +1 census

-- ------------------------------------------------------------- attachment
select has_trigger('public', t, t || '_audit', 'audit trigger on ' || t)
  from unnest(array['organizations','order_items','blocks','platform_staff','profiles']) as t;

-- count(*), not count(distinct tgname). Trigger names are unique per TABLE,
-- not per schema, so every table here names its trigger `<table>_audit` and
-- two tables could legitimately share a name -- at which point `distinct`
-- collapses them and the total reads low while the assertion still passes.
-- Counting rows counts triggers, which is what this is asserting.
select is(
  (select count(*)::int
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where p.proname = 'audit_row_change' and not t.tgisinternal),
  -- IF YOU ARE RESOLVING A MERGE CONFLICT ON THIS NUMBER: do not pick a side.
  -- Re-derive it. Both branches will have RAISED it, so if they added the same
  -- count of tables they will have written the SAME NUMBER on this line -- git
  -- then auto-merges it silently and raises a conflict only on the string
  -- below, and the merged total is short by whatever the other branch added.
  -- That happened on 2026-09-02: Stream A and Stream B each took 33 to 36, the
  -- true answer was 39, and the resulting failure reads as an audit-coverage
  -- problem rather than an arithmetic one.
  --
  -- Count it from the database instead of reasoning about it:
  --   select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  --    where p.proname = 'audit_row_change' and not t.tgisinternal;
  --
  -- The census assertion below is the one that actually holds invariant 5. This
  -- total exists to catch a trigger attached to the WRONG function, which the
  -- census cannot see -- it is deliberately brittle, and that is its job.
  43,
  '43 triggers total -- 25 org-scoped from PR 2/5, these five, notification_preferences (E1), support_requests (H1), ledger_events, C1''s conversations, conversation_participants and messages, towers, builds and bricks, mood_tags, table_prompts and table_entries, and vows'
);

-- The same claim from the other direction, and the one that actually holds the
-- invariant: no table in public is MISSING a trigger. The count above goes
-- stale silently every time a table is added; this does not.
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('audit_log', 'idempotency_keys', 'webhook_events')
      and not exists (
        select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
         where t.tgrelid = c.oid and p.proname = 'audit_row_change'
           and not t.tgisinternal)),
  '',
  'every table in public carries an audit trigger, except the three exempt by invariant 5'
);

-- Filter by trigger name: organizations and profiles each already carry an
-- unrelated trigger, so `limit 1` picked whichever came back first.
select is(
  (select encode(t.tgargs, 'escape')
     from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'organizations' and t.tgname = 'organizations_audit'),
  'self\000',
  'organizations declares the self resolution mode as a trigger argument'
);

-- --------------------------------------------------------------- behaviour
create temporary table _ids as
  select gen_random_uuid() as org_id,
         gen_random_uuid() as order_id,
         gen_random_uuid() as item_id,
         gen_random_uuid() as staff_id,
         (select id from public.profiles limit 1) as profile_id;

-- organizations: org_id resolves to the row's own id
insert into public.organizations (id, slug, name)
select org_id, 'audit-probe-org', 'Audit Probe' from _ids;

select is(
  (select org_id from public.audit_log
    where action = 'organizations.insert' and target_id = (select org_id from _ids)),
  (select org_id from _ids),
  'organizations logs itself as its own Family'
);

-- order_items: org_id resolves through the parent order
insert into public.orders (id, org_id, status, total_cents, currency)
select order_id, org_id, 'pending', 0, 'usd' from _ids;

insert into public.order_items (id, order_id, product_name, quantity, unit_price_cents)
select item_id, order_id, 'probe', 1, 0 from _ids;

select is(
  (select org_id from public.audit_log
    where action = 'order_items.insert' and target_id = (select item_id from _ids)),
  (select org_id from _ids),
  'order_items inherits org_id from its parent order'
);

select is(
  (select count(*)::int from public.audit_log
    where action = 'order_items.insert' and target_id = (select item_id from _ids)),
  1,
  'order_items writes exactly one row'
);

-- profiles: genuinely org-less, and that is recorded rather than guessed
-- The seed already sets every profile to UTC, so assigning UTC again would
-- change nothing. Use a genuinely different value.
update public.profiles set timezone = 'Pacific/Auckland'
 where id = (select profile_id from _ids);

select is(
  (select org_id from public.audit_log
    where action = 'profiles.update' and target_id = (select profile_id from _ids) limit 1),
  null,
  'profiles logs a null org_id -- it belongs to no Family'
);

select is(
  (select metadata -> 'changed' from public.audit_log
    where action = 'profiles.update' and target_id = (select profile_id from _ids) limit 1),
  '["timezone", "updated_at"]'::jsonb,
  'profiles UPDATE records changed column names only'
);

-- Assigning a column its existing value is not a change, and the diff must not
-- claim otherwise. Found by writing the assertion above against the seed's
-- existing UTC value and watching it report updated_at alone.
update public.profiles set timezone = 'Pacific/Auckland'
 where id = (select profile_id from _ids);

-- Counted rather than ordered: audit_log.created_at defaults to now(), which
-- is TRANSACTION time, so every row written inside one transaction shares a
-- timestamp and `order by created_at desc limit 1` is non-deterministic. Two
-- updates ran; only the first genuinely changed timezone.
select is(
  (select count(*)::int from public.audit_log
    where action = 'profiles.update'
      and target_id = (select profile_id from _ids)
      and metadata -> 'changed' @> '["timezone"]'::jsonb),
  1,
  're-assigning the same value records no change to that column'
);

select is(
  (select count(*)::int from public.audit_log
    where action = 'profiles.update' and target_id = (select profile_id from _ids)),
  2,
  'both updates were logged -- the second is recorded, just with no timezone change'
);

-- platform_staff: org-less, and a grant of platform access must leave a trace
-- Scoped to this row's id: the seed grants platform access to erin and frank,
-- so a global count by action is seed-dependent.
insert into public.platform_staff (id, profile_id)
select staff_id, profile_id from _ids;

select is(
  (select count(*)::int from public.audit_log
    where action = 'platform_staff.insert' and target_id = (select staff_id from _ids)),
  1,
  'granting platform access writes an audit row'
);

select is(
  (select org_id from public.audit_log
    where action = 'platform_staff.insert' and target_id = (select staff_id from _ids)),
  null,
  'platform_staff is org-less'
);

-- ------------------------------------------------------- mode is validated
select throws_ok(
  $$ create table public._bad_mode (id uuid primary key);
     create trigger _bad_mode_audit after insert on public._bad_mode
       for each row execute function public.audit_row_change('nonsense');
     insert into public._bad_mode (id) values (gen_random_uuid()); $$,
  null,
  'an unknown resolution mode raises rather than silently logging a null org'
);

-- ------------------------------------------------- deleting an organization
-- Regression: audit_log.org_id references organizations(id), so writing the
-- deleted id here violated the key and rolled the deletion back. Cascaded
-- children hit the same wall in the default `row` mode.
insert into public.cohorts (id, org_id, name)
select gen_random_uuid(), org_id, 'cascade probe' from _ids;

select lives_ok(
  $$ delete from public.organizations where slug = 'audit-probe-org' $$,
  'an organization can be deleted -- the audit insert must not violate its own foreign key'
);

select is(
  (select org_id from public.audit_log
    where action = 'organizations.delete' and target_id = (select org_id from _ids)),
  null,
  'the deleted org is not referenced in org_id'
);

select is(
  (select metadata ->> 'org_id_at_delete' from public.audit_log
    where action = 'organizations.delete' and target_id = (select org_id from _ids)),
  (select org_id::text from _ids),
  'attribution is preserved in metadata instead -- an id, not content'
);

select is(
  (select count(*)::int from public.audit_log
    where action = 'cohorts.delete'
      and metadata ->> 'org_id_at_delete' = (select org_id::text from _ids)),
  1,
  'a cascaded child delete is logged too, with the same preserved attribution'
);

select * from finish();
rollback;
