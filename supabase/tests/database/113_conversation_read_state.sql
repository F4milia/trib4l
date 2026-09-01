-- C1 PR 4: unread counts and read receipts.
--
-- The assertion this file exists for is the LAST one: an unread badge that
-- counts messages the viewer is not allowed to read is a leak, not an
-- off-by-one. A blocker who sees "3 new" in a room showing two messages has
-- been told exactly how much the person they blocked is saying.

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- ------------------------------------------------------------- fixtures
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000ae01', '_c1-read-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000be01', '_c1-read-b@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ce01', '_c1-read-c@example.test', 'authenticated', 'authenticated');

insert into public.organizations (id, slug, name)
values ('00000000-0000-0000-0000-00000000fe01', '_c1-read', 'Read Family');

insert into public.memberships (id, org_id, profile_id, role) values
  ('00000000-0000-0000-0000-0000000ae011', '00000000-0000-0000-0000-00000000fe01', '00000000-0000-0000-0000-00000000ae01', 'member'),
  ('00000000-0000-0000-0000-0000000be011', '00000000-0000-0000-0000-00000000fe01', '00000000-0000-0000-0000-00000000be01', 'member'),
  ('00000000-0000-0000-0000-0000000ce011', '00000000-0000-0000-0000-00000000fe01', '00000000-0000-0000-0000-00000000ce01', 'member');

-- PR 3 created the channel and joined all three when the memberships landed.
create temp table chan as
select id from public.conversations
 where org_id = '00000000-0000-0000-0000-00000000fe01' and kind = 'family_channel';
-- Temp tables are owned by the session role (postgres here), and the
-- assertions below run as `authenticated`, which otherwise cannot read them.
grant select on chan to authenticated;

select is((select count(*)::int from chan), 1, 'the Family channel exists, from PR 3');

-- b and c each say something; a has said nothing and read nothing.
insert into public.messages (org_id, conversation_id, author_membership_id, body) values
  ('00000000-0000-0000-0000-00000000fe01', (select id from chan), '00000000-0000-0000-0000-0000000be011', 'from b'),
  ('00000000-0000-0000-0000-00000000fe01', (select id from chan), '00000000-0000-0000-0000-0000000ce011', 'from c');

set local role authenticated;

-- -------------------------------------------------- the starting state
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);

select is(
  (select unread_count from public.unread_message_counts()
    where conversation_id = (select id from chan)),
  2::bigint,
  'a has read nothing, so both messages are unread'
);

-- Null rather than now() on join: defaulting to now() would mark a room read
-- before it was ever opened, and the member would never see the two messages
-- waiting for them.
reset role;
select is(
  (select last_read_at from public.conversation_participants
    where membership_id = '00000000-0000-0000-0000-0000000ae011'),
  null::timestamptz,
  'a participant starts with no read mark at all -- not with now()'
);
set local role authenticated;

-- ------------------------------------------------------- marking read
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);

select isnt(
  public.mark_conversation_read((select id from chan)),
  null,
  'a can mark the room read'
);

select is(
  (select count(*)::int from public.unread_message_counts()
    where conversation_id = (select id from chan)),
  0,
  'and the room drops out of the unread list entirely'
);

-- A new message after the mark is unread again.
--
-- created_at is set EXPLICITLY rather than left to its default. now() is
-- TRANSACTION time, and pgTAP runs this whole file in one transaction, so the
-- default would give this message the same timestamp as the read mark set
-- three statements ago -- and `created_at > last_read_at` would be false. The
-- message would look already-read, and the assertion would fail for a reason
-- that has nothing to do with the feature. Same trap as the audit_log
-- created_at entry in CLAUDE.md's learned constraints, in a new place.
reset role;
insert into public.messages (org_id, conversation_id, author_membership_id, body, created_at)
values ('00000000-0000-0000-0000-00000000fe01', (select id from chan),
        '00000000-0000-0000-0000-0000000be011', 'from b, later',
        now() + interval '1 minute');
set local role authenticated;

select is(
  (select unread_count from public.unread_message_counts()
    where conversation_id = (select id from chan)),
  1::bigint,
  'a message sent after the mark is unread again'
);

-- ------------------------------------------------- your own words are not news
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000be01","role":"authenticated"}', true);

select is(
  (select coalesce(unread_count, 0) from public.unread_message_counts()
    where conversation_id = (select id from chan)),
  1::bigint,
  'b sees only c''s message as unread -- b''s own two do not count'
);

-- --------------------------------------------------- the mark cannot go back
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ae01","role":"authenticated"}', true);
select public.mark_conversation_read((select id from chan));

reset role;
create temp table mark as
select last_read_at from public.conversation_participants
 where membership_id = '00000000-0000-0000-0000-0000000ae011';
grant select on mark to authenticated;

-- Simulate the slower of two devices arriving with an older timestamp.
update public.conversation_participants
   set last_read_at = (select last_read_at from mark) + interval '1 hour'
 where membership_id = '00000000-0000-0000-0000-0000000ae011';
set local role authenticated;

select public.mark_conversation_read((select id from chan));

reset role;
select ok(
  (select last_read_at from public.conversation_participants
    where membership_id = '00000000-0000-0000-0000-0000000ae011')
  > (select last_read_at from mark),
  'a later mark is never moved backwards by a slower device'
);
set local role authenticated;

-- --------------------------------------------------------- read receipts
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000be01","role":"authenticated"}', true);

select isnt(
  (select last_read_at from public.conversation_participants
    where membership_id = '00000000-0000-0000-0000-0000000ae011'),
  null,
  'b can see how far a has read -- that is the read receipt'
);

-- ------------------------------------ a non-participant marks nothing read
reset role;
insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-00000000de01', '_c1-read-d@example.test', 'authenticated', 'authenticated');
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000de01","role":"authenticated"}', true);

select is(
  public.mark_conversation_read((select id from chan)),
  null::timestamptz,
  'someone who is not in the room cannot mark it read, definer function or not'
);

-- ============================================================= THE LEAK
-- Invariant 6 in its quietest form. c blocks b, then counts.
reset role;
insert into public.member_blocks (org_id, blocker_membership_id, blocked_membership_id)
values ('00000000-0000-0000-0000-00000000fe01',
        '00000000-0000-0000-0000-0000000ce011',
        '00000000-0000-0000-0000-0000000be011');
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ce01","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.messages
    where conversation_id = (select id from chan)),
  1,
  'c, having blocked b, sees only their own message in the room'
);

-- b wrote two of the three messages. If this returns anything above zero, the
-- badge is counting rows the policy hides -- which tells c precisely how much
-- b is posting. SECURITY INVOKER on unread_message_counts() is what makes the
-- count inherit the same policy as the read.
select is(
  (select coalesce(sum(unread_count), 0) from public.unread_message_counts()
    where conversation_id = (select id from chan)),
  0::numeric,
  'and the unread count agrees -- a blocked author''s messages never reach the badge'
);

select * from finish();
rollback;
