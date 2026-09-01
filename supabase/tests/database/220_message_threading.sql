-- C2 PR 2, commit 1. Threading.
--
-- The FK guarantees the parent EXISTS and says nothing about which conversation
-- it is in. A reply pointing at a message in another Family's room would be a
-- cross-Family read through a COLUMN rather than through a policy -- which is
-- the shape RLS cannot see, because every row involved passes its own policy.
--
-- pgTAP runs as postgres and bypasses RLS, which is exactly right for this
-- file: the trigger has to hold for the service role too.

begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

-- Distinct id namespace (0c2a*) from every other file in the suite. Reusing ids
-- across files is how a test starts depending on its neighbours.
create temporary table _f as
select '00000000-0000-0000-0000-0000000c2a01'::uuid as org_id,
       '00000000-0000-0000-0000-0000000c2a02'::uuid as member_id,
       '00000000-0000-0000-0000-0000000c2a03'::uuid as profile_id,
       '00000000-0000-0000-0000-0000000c2a04'::uuid as conv_a,
       '00000000-0000-0000-0000-0000000c2a05'::uuid as conv_b,
       '00000000-0000-0000-0000-0000000c2a06'::uuid as parent_id,
       '00000000-0000-0000-0000-0000000c2a07'::uuid as reply_id;

-- handle_new_user() creates the profile row; memberships.profile_id has an FK
-- to profiles, so the auth.users insert has to come first.
insert into auth.users (id, email, aud, role)
select profile_id, '_c2-threading@example.test', 'authenticated', 'authenticated' from _f;

insert into public.organizations (id, slug, name)
select org_id, 'c2-threading-probe', 'Threading Probe' from _f;

insert into public.memberships (id, org_id, profile_id, role)
select member_id, org_id, profile_id, 'org_owner'::membership_role from _f;

-- The family_channel is auto-created by C1's trigger, so a second conversation
-- is created explicitly to give the cross-conversation case somewhere to point.
insert into public.conversations (id, org_id, kind, created_by_membership_id)
select conv_a, org_id, 'direct'::conversation_kind, member_id from _f
union all
select conv_b, org_id, 'direct'::conversation_kind, member_id from _f;

insert into public.conversation_participants (conversation_id, org_id, membership_id)
select conv_a, org_id, member_id from _f
union all
select conv_b, org_id, member_id from _f;

insert into public.messages (id, org_id, conversation_id, author_membership_id, body)
select parent_id, org_id, conv_a, member_id, 'the parent' from _f;

-- ------------------------------------------------------------------- shape
select has_column('public', 'messages', 'parent_message_id',
  'messages carries parent_message_id');

select col_is_null('public', 'messages', 'parent_message_id',
  'a message need not be a reply');

select has_index('public', 'messages', 'messages_parent_message_id_idx',
  'replies are indexed by parent -- "show me this thread" must not scan');

select has_trigger('public', 'messages', 'messages_parent_in_same_conversation',
  'the child-matches-parent trigger is attached');

-- --------------------------------------------------------------- behaviour
select lives_ok(
  $$
    insert into public.messages (id, org_id, conversation_id, author_membership_id, body, parent_message_id)
    select reply_id, org_id, conv_a, member_id, 'a reply', parent_id from _f
  $$,
  'a reply in the parent''s own conversation is allowed'
);

-- throws_like, not throws_ok: `throws_ok(sql, null, null, desc)` accepts ANY
-- error, so a typo raising 42703 would pass while asserting nothing. The C1 PR1
-- lesson -- two cross-Family assertions once passed on the wrong exception.
select throws_like(
  $$
    insert into public.messages (org_id, conversation_id, author_membership_id, body, parent_message_id)
    select org_id, conv_b, member_id, 'a reply from the wrong room', parent_id from _f
  $$,
  '%must stay in its parent conversation%',
  'a reply CANNOT point at a message in another conversation'
);

select throws_like(
  $$
    insert into public.messages (org_id, conversation_id, author_membership_id, body, parent_message_id)
    select org_id, conv_a, member_id, 'orphan',
           '00000000-0000-0000-0000-0000000c2aff'::uuid from _f
  $$,
  '%does not exist%',
  'a reply CANNOT point at a message that does not exist'
);

-- Deleting a parent must not take its replies with it: C1 soft-deletes messages
-- precisely so replies do not dangle, and a cascade here would defeat that.
select lives_ok(
  $$ delete from public.messages where id = (select parent_id from _f) $$,
  'a parent can be hard-deleted'
);

select is(
  (select parent_message_id from public.messages where id = (select reply_id from _f)),
  null,
  'and its reply survives with a null parent, rather than being cascaded away'
);

select * from finish();
rollback;
