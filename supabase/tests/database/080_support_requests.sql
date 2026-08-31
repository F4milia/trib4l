-- support_requests -- H1's storage. The run doc: "Help page: FAQ plus a
-- contact form routing to platform_staff, written to the audit log like every
-- mutation."
--
-- The decision this file exists to pin down: org_id is NULLABLE, and that is
-- the feature, not an oversight. H1's named edge case for the 09:30 review is
-- "a user in no Family submits the form -- routes to staff, audit row
-- written." Somebody who has signed up and not yet joined or created a Family
-- is exactly the person most likely to need help, and a NOT NULL org_id would
-- lock them out of the only channel they have.
--
-- So the table follows `profiles` and `blocks`: genuinely org-less rows record
-- a null org_id in audit_log rather than guessing one.

begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- ------------------------------------------------------------------- shape
select has_table('public', 'support_requests', 'support_requests exists');
select col_not_null('public', 'support_requests', 'subject', 'a request has a subject');
select col_not_null('public', 'support_requests', 'body', 'a request has a body');
select col_not_null('public', 'support_requests', 'status', 'a request is always open or handled');

select col_is_null('public', 'support_requests', 'org_id',
  'org_id is nullable -- a member of no Family must be able to ask for help');

-- on delete set null rather than cascade: a support request is a record of a
-- staff interaction and outlives the Family it was about, same reasoning as
-- reports and orders.
select col_is_null('public', 'support_requests', 'submitted_by_profile_id',
  'submitted_by_profile_id is nullable -- the record outlives a purged account');

select hasnt_column('public', 'support_requests', 'deleted_at',
  'no soft delete -- status carries the lifecycle, same as invitations');

-- -------------------------------------------------------------------- RLS
select ok(
  (select relrowsecurity from pg_class where oid = 'public.support_requests'::regclass),
  'row level security is enabled'
);

select ok(
  (select count(distinct privilege_type)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'support_requests'
      and grantee = 'authenticated'
      and privilege_type in ('SELECT', 'INSERT')) = 2,
  'authenticated can submit a request and read it back'
);

-- Nobody edits their own request after sending it, and nobody deletes one.
-- A support thread staff have acted on is not the submitter's to rewrite.
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'support_requests'
      and grantee = 'authenticated'
      and privilege_type = 'DELETE'),
  0,
  'authenticated cannot delete a request'
);

-- ------------------------------------------------------------------ audit
-- Invariant 5: a new table gets its trigger in the same migration that
-- creates it.
select has_trigger('public', 'support_requests', 'support_requests_audit',
  'the audit trigger ships in the same migration as the table');

-- ----------------------------------------------------------------- probes
create temporary table _sr_probe as
  select '00000000-0000-0000-0000-00000000000a'::uuid as org_id,
         (select profile_id from public.memberships
           where org_id = '00000000-0000-0000-0000-00000000000a'
             and deleted_at is null
           order by created_at limit 1) as member_id,
         '00000000-0000-0000-0000-0000000000d1'::uuid as with_family_id,
         '00000000-0000-0000-0000-0000000000d2'::uuid as no_family_id;

select isnt((select member_id from _sr_probe), null,
  'the probe found a real seeded member');

-- A request from inside a Family.
insert into public.support_requests
  (id, submitted_by_profile_id, org_id, subject, body)
select with_family_id, member_id, org_id, 'Cannot invite anyone', 'The invite button does nothing.'
  from _sr_probe;

select is(
  (select status::text from public.support_requests
    where id = (select with_family_id from _sr_probe)),
  'open',
  'a new request starts open'
);

select is(
  (select org_id from public.audit_log
    where target_type = 'support_requests'
      and target_id = (select with_family_id from _sr_probe)),
  (select org_id from _sr_probe),
  'a request from inside a Family is audited against that Family'
);

-- ------------------------------------------- the named edge case, at schema level
-- No org_id at all: the pre-Family support path.
insert into public.support_requests
  (id, submitted_by_profile_id, org_id, subject, body)
select no_family_id, member_id, null, 'How do I join a Family?', 'I signed up and there is nothing here.'
  from _sr_probe;

select is(
  (select count(*)::int from public.support_requests
    where id = (select no_family_id from _sr_probe)),
  1,
  'a request with no Family is accepted -- the pre-Family path exists'
);

select is(
  (select count(*)::int from public.audit_log
    where target_type = 'support_requests'
      and target_id = (select no_family_id from _sr_probe)
      and action = 'support_requests.insert'),
  1,
  'and it still writes exactly one audit row -- H1s acceptance criterion'
);

select is(
  (select org_id from public.audit_log
    where target_type = 'support_requests'
      and target_id = (select no_family_id from _sr_probe)),
  null,
  'that row records a null Family rather than guessing one'
);

-- ------------------------------------------------------- content stays out
-- Invariant 3 and 4 are about outbound messages and analytics, but the audit
-- log is the one place a body could leak into a table read by staff tooling.
-- metadata carries column names only; asserted here because support_requests
-- is the first table whose whole purpose is free text a member typed.
select is(
  (select count(*)::int from public.audit_log
    where target_type = 'support_requests'
      and metadata::text like '%invite button%'),
  0,
  'no request body reaches audit_log.metadata'
);

-- ------------------------------------------------------------- lifecycle
update public.support_requests set status = 'handled'
 where id = (select with_family_id from _sr_probe);

select is(
  (select count(*)::int from public.audit_log
    where target_type = 'support_requests'
      and target_id = (select with_family_id from _sr_probe)
      and action = 'support_requests.update'
      and metadata -> 'changed' @> '["status"]'::jsonb),
  1,
  'marking a request handled is audited and names the status column'
);

select throws_ok(
  $$insert into public.support_requests (subject, body, status)
    values ('x', 'y', 'escalated')$$,
  '22P02',
  null,
  'status is a closed set -- an invented state is rejected'
);

-- A request must actually say something. An empty contact form is a support
-- ticket nobody can action.
select throws_ok(
  $$insert into public.support_requests (subject, body) values ('', 'y')$$,
  '23514',
  null,
  'an empty subject is rejected'
);

select throws_ok(
  $$insert into public.support_requests (subject, body) values ('x', '   ')$$,
  '23514',
  null,
  'a whitespace-only body is rejected'
);

select * from finish();
rollback;
