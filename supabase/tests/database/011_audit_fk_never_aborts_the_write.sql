-- CD-3 and CD-4: audit_log's two foreign keys could abort the write the
-- trigger exists to record.
--
-- What this file can and cannot prove, stated plainly. CD-3's live shape is a
-- race between one transaction's SELECT and another's COMMIT, and pgTAP runs
-- one session inside one transaction -- so the race itself is not reproducible
-- here. What IS reproducible, and is the same defect, is the outcome the race
-- produces: an INSERT into audit_log naming an organization that is not there.
-- Every assertion below drives that state deterministically. The race is the
-- means; the dangling reference is the fault, and it is the fault that is
-- tested.

begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- ------------------------------------------------------------------- CD-4
-- A well-formed uuid `sub` naming no profiles row. Before this fix the FK
-- aborted every write by that caller.
create table public._probe_actor (id uuid primary key default gen_random_uuid(), org_id uuid);
create trigger _probe_actor_audit after insert or update or delete on public._probe_actor
  for each row execute function public.audit_row_change();

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ff"}', true);

select lives_ok(
  $$ insert into public._probe_actor (org_id) values (null) $$,
  'an actor uuid with no profiles row does not abort the write (CD-4)'
);

select is(
  (select count(*)::int from public.audit_log where target_type = '_probe_actor'),
  1,
  'and the audit row exists -- the write is recorded, not silently dropped'
);

select is(
  (select actor_profile_id from public.audit_log where target_type = '_probe_actor'),
  null::uuid,
  'the unresolvable actor is null, which is true -- not a uuid the database cannot vouch for'
);

select is(
  (select metadata ->> 'actor_unresolved' from public.audit_log where target_type = '_probe_actor'),
  'true',
  'and the fact that an actor was claimed is preserved in metadata'
);

select ok(
  (select metadata::text not like '%0000000000ff%' from public.audit_log where target_type = '_probe_actor'),
  'the unverified uuid itself is never stored -- it names nothing'
);

reset request.jwt.claims;

-- ------------------------------------------------------------------- CD-3
-- A row whose org_id names no organization. This is the state the CD-3 race
-- leaves behind, reached deterministically: the probe table carries an org_id
-- column with no foreign key of its own, so the parent write succeeds and only
-- audit_log's reference is dangling.
create table public._probe_org (id uuid primary key default gen_random_uuid(), org_id uuid);
create trigger _probe_org_audit after insert or update or delete on public._probe_org
  for each row execute function public.audit_row_change();

select lives_ok(
  $$ insert into public._probe_org (org_id) values ('00000000-0000-0000-0000-0000000000fe') $$,
  'an org_id naming no organization does not abort the write (CD-3)'
);

select is(
  (select org_id from public.audit_log where target_type = '_probe_org'),
  null::uuid,
  'the dangling org reference is not written to the column'
);

select is(
  (select metadata ->> 'org_id_unresolved' from public.audit_log where target_type = '_probe_org'),
  '00000000-0000-0000-0000-0000000000fe',
  'it is preserved in metadata instead -- a uuid is an id, not content'
);

-- ------------------------------------------- CD-3 + CD-4 at the same time
-- Both references bad on one write. The inner handler is the only path that
-- reaches this, and nothing in it has a foreign key, so it must terminate.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ff"}', true);

select lives_ok(
  $$ insert into public._probe_org (org_id) values ('00000000-0000-0000-0000-0000000000fd') $$,
  'both references bad at once still does not abort the write'
);

select is(
  (select count(*)::int from public.audit_log
    where target_type = '_probe_org'
      and metadata ->> 'org_id_unresolved' = '00000000-0000-0000-0000-0000000000fd'
      and metadata ->> 'actor_unresolved' = 'true'
      and actor_profile_id is null and org_id is null),
  1,
  'and both attributions land in metadata with both columns null'
);

reset request.jwt.claims;

-- ------------------------------------------------ the routine delete path
-- Deleting an organization is the everyday case that lands in the handler.
-- 030 already asserts org_id_at_delete; this asserts the half that the old
-- pre-check happened to give and that a careless fix would drop: the actor who
-- performed the deletion is still recorded.
--
-- Filtered on `action`, not target_type: the fixture's own INSERT writes an
-- organizations row carrying the SAME target_id, so target_type alone matches
-- two rows. Scope every assertion to the row it means -- the 2026-08-29
-- learned constraint, in its single-row form.
--
-- The actor is a real profile, created here rather than borrowed from the
-- seed, so this file states its own preconditions. Inserting the auth.users
-- row is enough: an existing trigger creates the matching profiles row.
insert into auth.users (id, email, aud, role)
  values ('00000000-0000-0000-0000-0000000000ac', '_probe-actor@example.test',
          'authenticated', 'authenticated');

insert into public.organizations (id, slug, name)
  values ('00000000-0000-0000-0000-0000000000ab', '_probe-del', 'Probe Delete');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ac"}', true);

select is(
  (select count(*)::int from public.organizations
    where id = '00000000-0000-0000-0000-0000000000ab'),
  1,
  'fixture organization exists before the deletion'
);

select lives_ok(
  $$ delete from public.organizations where id = '00000000-0000-0000-0000-0000000000ab' $$,
  'deleting an organization still succeeds -- the audit row does not block it'
);

select is(
  (select metadata ->> 'org_id_at_delete' from public.audit_log
    where action = 'organizations.delete'
      and target_id = '00000000-0000-0000-0000-0000000000ab'),
  '00000000-0000-0000-0000-0000000000ab',
  'the deleted organization is attributed in metadata, under the key it has always used'
);

select is(
  (select org_id from public.audit_log
    where action = 'organizations.delete'
      and target_id = '00000000-0000-0000-0000-0000000000ab'),
  null::uuid,
  'and the column is null, because the organization is genuinely gone'
);

-- The half that makes the CONSTRAINT_NAME branch worth its complexity. The
-- organization is gone, so its column must be null -- but the actor is a live
-- profile and nothing about the organization's deletion makes them unknowable.
-- A handler that nulled both columns on any violation would pass every
-- assertion above this one and silently lose the actor on every organization
-- deletion in the product.
select is(
  (select actor_profile_id from public.audit_log
    where action = 'organizations.delete'
      and target_id = '00000000-0000-0000-0000-0000000000ab'),
  '00000000-0000-0000-0000-0000000000ac'::uuid,
  'the actor who deleted the organization is still recorded -- only the gone '
  'reference is dropped, not both'
);

reset request.jwt.claims;

select * from finish();
rollback;
