-- C2 PR 2, commits 2-4. Notifications, mentions, and the session's NAMED EDGE
-- CASE:
--
--   B @mentions A after A blocked B -- no notification reaches A; the room is
--   unaffected.
--
-- Both halves are asserted, and the second is the one a careless fix would
-- break: suppressing the MENTION ROW as well as the notification would also
-- make "no notification reaches A" pass, while changing what the room contains.
-- The message still says what it says.
--
-- Testable in pgTAP because this is TRIGGER logic, not RLS -- the suppression
-- has to hold for the service role too, and running as postgres proves that
-- rather than working around it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

create temporary table _f as
select '00000000-0000-0000-0000-0000000c2a11'::uuid as org_id,
       '00000000-0000-0000-0000-0000000c2a12'::uuid as a_membership,  -- the blocker, mentioned
       '00000000-0000-0000-0000-0000000c2a13'::uuid as b_membership,  -- the blocked, author
       '00000000-0000-0000-0000-0000000c2a14'::uuid as c_membership,  -- an unrelated third
       '00000000-0000-0000-0000-0000000c2a15'::uuid as a_profile,
       '00000000-0000-0000-0000-0000000c2a16'::uuid as b_profile,
       '00000000-0000-0000-0000-0000000c2a17'::uuid as c_profile,
       '00000000-0000-0000-0000-0000000c2a18'::uuid as conv_id,
       '00000000-0000-0000-0000-0000000c2a19'::uuid as msg_blocked,
       '00000000-0000-0000-0000-0000000c2a1a'::uuid as msg_allowed,
       '00000000-0000-0000-0000-0000000c2a1b'::uuid as msg_self;

insert into auth.users (id, email, aud, role)
select a_profile, '_c2-a@example.test', 'authenticated', 'authenticated' from _f
union all select b_profile, '_c2-b@example.test', 'authenticated', 'authenticated' from _f
union all select c_profile, '_c2-c@example.test', 'authenticated', 'authenticated' from _f;

insert into public.organizations (id, slug, name)
select org_id, 'c2-mentions-probe', 'Mentions Probe' from _f;

insert into public.memberships (id, org_id, profile_id, role)
select a_membership, org_id, a_profile, 'org_owner'::membership_role from _f
union all select b_membership, org_id, b_profile, 'member'::membership_role from _f
union all select c_membership, org_id, c_profile, 'member'::membership_role from _f;

insert into public.conversations (id, org_id, kind, created_by_membership_id)
select conv_id, org_id, 'direct'::conversation_kind, b_membership from _f;

insert into public.conversation_participants (conversation_id, org_id, membership_id)
select conv_id, org_id, a_membership from _f
union all select conv_id, org_id, b_membership from _f
union all select conv_id, org_id, c_membership from _f;

insert into public.messages (id, org_id, conversation_id, author_membership_id, body)
select msg_blocked, org_id, conv_id, b_membership, 'hey @a' from _f
union all select msg_allowed, org_id, conv_id, b_membership, 'hey @c' from _f
union all select msg_self, org_id, conv_id, a_membership, 'note to @a' from _f;

-- A blocks B. Direction matters and is easy to invert: it is the MENTIONED
-- member blocking the AUTHOR that suppresses. B blocking A would not.
insert into public.member_blocks (org_id, blocker_membership_id, blocked_membership_id)
select org_id, a_membership, b_membership from _f;

-- ------------------------------------------------------------------- shape
select has_table('public', 'notifications', 'notifications exists');
select has_table('public', 'message_mentions', 'message_mentions exists');

select has_trigger('public', 'notifications', 'notifications_audit',
  'invariant 5: the audit trigger arrives with the table');
select has_trigger('public', 'message_mentions', 'message_mentions_audit',
  'invariant 5: same for message_mentions');

-- Invariant 3 is a SCHEMA property here, not a convention. N1 renders emails
-- and pushes from these rows; if a text column existed, interpolating it would
-- be the shortest path to a useful notification.
select is_empty(
  $$
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications'
       and column_name in ('body', 'title', 'message', 'preview', 'excerpt', 'content')
  $$,
  'notifications carries NO content column -- invariant 3 enforced by shape, '
  'so the compliant implementation is also the only available one'
);

select ok(
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = 'notification_type' and e.enumlabel = 'mention'),
  'notification_type gained ''mention'' -- C2 owns this, not N1'
);

-- ----------------------------------------------------- the named edge case
select lives_ok(
  $$
    insert into public.message_mentions (org_id, message_id, mentioned_membership_id)
    select org_id, msg_blocked, a_membership from _f
  $$,
  'B may still mention A -- the block does not reject the write'
);

select is(
  (select count(*)::int from public.message_mentions mm, _f
    where mm.message_id = _f.msg_blocked),
  1,
  'THE ROOM IS UNAFFECTED: the mention row exists, because the message really '
  'does contain the mention'
);

select is(
  (select count(*)::int from public.notifications n, _f
    where n.membership_id = _f.a_membership),
  0,
  'NO NOTIFICATION REACHES A: suppressed at write time, so N1 cannot later '
  'turn it into an email that has already left the building'
);

-- The control. Without it, "A got no notification" is satisfied by a trigger
-- that never fires for anyone.
select lives_ok(
  $$
    insert into public.message_mentions (org_id, message_id, mentioned_membership_id)
    select org_id, msg_allowed, c_membership from _f
  $$,
  'B mentions C, who has blocked nobody'
);

select is(
  (select count(*)::int from public.notifications n, _f
    where n.membership_id = _f.c_membership and n.type = 'mention'),
  1,
  'C IS notified -- so the suppression above is the block working, not the '
  'trigger being broken'
);

select is(
  (select actor_membership_id from public.notifications n, _f
    where n.membership_id = _f.c_membership),
  (select b_membership from _f),
  'and the notification records who caused it, as an id rather than a name'
);

-- Mentioning yourself is not news.
select lives_ok(
  $$
    insert into public.message_mentions (org_id, message_id, mentioned_membership_id)
    select org_id, msg_self, a_membership from _f
  $$,
  'A may mention themselves'
);

select is(
  (select count(*)::int from public.notifications n, _f
    where n.membership_id = _f.a_membership),
  0,
  'and is not notified about it'
);

select * from finish();
rollback;
