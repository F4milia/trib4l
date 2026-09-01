-- C1 PR 1: schema, integrity, and the deny-all starting state.
--
-- The assertions that matter here are the ones about what CANNOT be written.
-- PR 2's policies decide who may read a conversation; this file decides
-- whether a row can exist that claims the wrong Family in the first place. If
-- it can, no policy above it is trustworthy, because every policy in PR 2
-- reads org_id.

begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

-- ------------------------------------------------------------- shape
select has_table('public', 'conversations', 'conversations exists');
select has_table('public', 'conversation_participants', 'conversation_participants exists');
select has_table('public', 'messages', 'messages exists');

-- Invariant 5: the trigger arrives with the table, not after it.
select has_trigger('public', t, t || '_audit', 'audit trigger on ' || t)
  from unnest(array['conversations','conversation_participants','messages']) as t;

-- RLS on with no policies is the deny-all starting state this PR ships. If a
-- later session adds a grant without a policy, this still holds; if it adds a
-- policy, PR 2's file owns that assertion.
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('conversations','conversation_participants','messages')
      and c.relrowsecurity),
  3,
  'RLS is enabled on all three tables'
);

-- ------------------------------------------------------- fixtures
-- Two Families and a member in each. Built here rather than borrowed from the
-- seed so this file states its own preconditions.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000c1', '_c1-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', '_c1-b@example.test', 'authenticated', 'authenticated');

insert into public.organizations (id, slug, name) values
  ('00000000-0000-0000-0000-00000000fa01', '_c1-family-a', 'Family A'),
  ('00000000-0000-0000-0000-00000000fb01', '_c1-family-b', 'Family B');

insert into public.memberships (id, org_id, profile_id, role) values
  ('00000000-0000-0000-0000-000000000aa1',
   '00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-0000000000c1', 'member'),
  ('00000000-0000-0000-0000-000000000bb1',
   '00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-0000000000c2', 'member');

-- PR 3 gives every new Family a channel automatically, so the explicit
-- family_channel insert below would now collide with it. These files pin
-- specific conversation ids to keep their assertions readable, so they drop
-- the auto-created room and install their own. Deleting it cascades away the
-- participants the membership trigger added, which is why this comes after the
-- memberships and before the fixture conversations.
delete from public.conversations where kind = 'family_channel' and org_id in ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000fb01');

insert into public.conversations (id, org_id, kind, created_by_membership_id) values
  ('00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-00000000fa01', 'family_channel',
   '00000000-0000-0000-0000-000000000aa1'),
  -- A direct room as well. The happy-path and body-cap assertions below use
  -- THIS one, not the channel: PR 3's membership trigger auto-joins the family
  -- channel whenever a membership becomes active, so an explicit participant
  -- insert into the channel collides with the trigger's own. A direct
  -- conversation is not auto-managed, so those assertions test the integrity
  -- trigger rather than racing PR 3's.
  ('00000000-0000-0000-0000-0000000000e2',
   '00000000-0000-0000-0000-00000000fa01', 'direct',
   '00000000-0000-0000-0000-000000000aa1');

-- ------------------------------------------- one channel per Family
select throws_ok(
  $$ insert into public.conversations (org_id, kind)
     values ('00000000-0000-0000-0000-00000000fa01', 'family_channel') $$,
  '23505',
  null,
  'a Family cannot have two Family channels -- enforced, not intended'
);

select lives_ok(
  $$ insert into public.conversations (org_id, kind)
     values ('00000000-0000-0000-0000-00000000fa01', 'direct') $$,
  'but it can have many direct conversations'
);

-- ------------------------------------- the claim that must not be forgeable
-- Everything below is the same defect wearing different clothes: a child row
-- claiming a Family that its parent, or its member, does not belong to.
--
-- throws_like with the guard's own message, NOT throws_ok(sql, null, null),
-- which accepts any error at all. The first version of this file used the
-- permissive form and two of these assertions passed on an unrelated 42703
-- raised by a bug in the trigger -- green, and proving nothing.
select throws_like(
  $$ insert into public.messages (org_id, conversation_id, author_membership_id, body)
     values ('00000000-0000-0000-0000-00000000fb01',
             '00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000aa1', 'wrong org') $$,
  '%does not match conversation%',
  'a message cannot claim an org_id its conversation does not have'
);

select throws_like(
  $$ insert into public.messages (org_id, conversation_id, author_membership_id, body)
     values ('00000000-0000-0000-0000-00000000fa01',
             '00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000bb1', 'wrong family') $$,
  '%belongs to a different Family%',
  'a member of Family B cannot author into Family A''s conversation'
);

select throws_like(
  $$ insert into public.conversation_participants (org_id, conversation_id, membership_id)
     values ('00000000-0000-0000-0000-00000000fa01',
             '00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000bb1') $$,
  '%belongs to a different Family%',
  'a member of Family B cannot be made a participant in Family A''s conversation'
);

-- A soft-deleted membership is not an active one. This is the departure case:
-- a member who has left cannot be added to a room afterwards.
update public.memberships set deleted_at = now()
 where id = '00000000-0000-0000-0000-000000000aa1';

select throws_like(
  $$ insert into public.conversation_participants (org_id, conversation_id, membership_id)
     values ('00000000-0000-0000-0000-00000000fa01',
             '00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-000000000aa1') $$,
  '%is not an active membership%',
  'a departed member cannot be added as a participant'
);

update public.memberships set deleted_at = null
 where id = '00000000-0000-0000-0000-000000000aa1';

-- ------------------------------------------------------ the happy path
select lives_ok(
  $$ insert into public.conversation_participants (org_id, conversation_id, membership_id)
     values ('00000000-0000-0000-0000-00000000fa01',
             '00000000-0000-0000-0000-0000000000e2',
             '00000000-0000-0000-0000-000000000aa1') $$,
  'a member of the conversation''s own Family can be a participant'
);

select lives_ok(
  $$ insert into public.messages (org_id, conversation_id, author_membership_id, body)
     values ('00000000-0000-0000-0000-00000000fa01',
             '00000000-0000-0000-0000-0000000000e2',
             '00000000-0000-0000-0000-000000000aa1', 'hello Family') $$,
  'and can post into it'
);

-- ------------------------------------------------------- the body cap
-- 1000 characters, per James 2026-09-01. Asserted rather than left as a
-- constant in the migration: a CHECK nobody tests is a number that drifts.
select lives_ok(
  $$ insert into public.messages (org_id, conversation_id, author_membership_id, body)
     values ('00000000-0000-0000-0000-00000000fa01',
             '00000000-0000-0000-0000-0000000000e2',
             '00000000-0000-0000-0000-000000000aa1', repeat('x', 1000)) $$,
  'a message of exactly 1000 characters is accepted'
);

select throws_ok(
  $$ insert into public.messages (org_id, conversation_id, author_membership_id, body)
     values ('00000000-0000-0000-0000-00000000fa01',
             '00000000-0000-0000-0000-0000000000e2',
             '00000000-0000-0000-0000-000000000aa1', repeat('x', 1001)) $$,
  '23514',
  null,
  'and 1001 is refused by the CHECK'
);

-- ------------------------------------------------------------ audit
-- Scoped to the row this file created: a global count by action is an
-- order-dependent assertion wearing a precise-looking number (2026-08-29).
select is(
  (select count(*)::int from public.audit_log
    where action = 'messages.insert'
      and org_id = '00000000-0000-0000-0000-00000000fa01'),
  2,
  'each accepted message write is audited -- the refused one wrote nothing'
);

select is(
  (select distinct metadata::text from public.audit_log
    where action = 'messages.insert'
      and org_id = '00000000-0000-0000-0000-00000000fa01'),
  '{}',
  'and the audit row carries no message body -- metadata is names, never content'
);

select * from finish();
rollback;
