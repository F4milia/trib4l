-- C1 PR 2: participant-scoped RLS, and the session's named edge case.
--
-- Every assertion runs as `authenticated` with a real JWT claim, never as the
-- table owner and never as service_role -- CLAUDE.md's testing rules. A test
-- that reads as the owner proves the query works, not that the policy does.
--
-- THE FIXTURE IS THE DUAL-FAMILY USER, because that is the named edge case for
-- the 09:30 review: dana belongs to Family A AND Family B and must see exactly
-- her own conversations in each, nothing across. She is built first and used
-- throughout rather than added as a final special case at the bottom -- a
-- fixture that only exists for one assertion tends to only be correct for one
-- assertion.

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- ------------------------------------------------------------- fixtures
--   Family A: alice, bob, dana
--   Family B: carol, dana
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000a11c', '_c1-alice@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b0b0', '_c1-bob@example.test',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ca01', '_c1-carol@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000da4a', '_c1-dana@example.test',  'authenticated', 'authenticated');

insert into public.organizations (id, slug, name) values
  ('00000000-0000-0000-0000-00000000fa02', '_c1-rls-a', 'Family A'),
  ('00000000-0000-0000-0000-00000000fb02', '_c1-rls-b', 'Family B');

--            membership id                          org     profile
insert into public.memberships (id, org_id, profile_id, role) values
  ('00000000-0000-0000-0000-0000000a1ce1', '00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000a11c', 'member'),
  ('00000000-0000-0000-0000-0000000b0b01', '00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000b0b0', 'member'),
  ('00000000-0000-0000-0000-0000000ca011', '00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000ca01', 'member'),
  -- dana, twice: one person, two Families, two memberships.
  ('00000000-0000-0000-0000-0000000da4a1', '00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000da4a', 'member'),
  ('00000000-0000-0000-0000-0000000da4a2', '00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-00000000da4a', 'member');

-- Family A's channel (alice, bob, dana), Family B's channel (carol, dana),
-- and a DM in Family A between alice and bob that dana is NOT in.
-- PR 3 gives every new Family a channel automatically, so the explicit
-- family_channel insert below would now collide with it. These files pin
-- specific conversation ids to keep their assertions readable, so they drop
-- the auto-created room and install their own. Deleting it cascades away the
-- participants the membership trigger added, which is why this comes after the
-- memberships and before the fixture conversations.
delete from public.conversations where kind = 'family_channel' and org_id in ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000fb02');

insert into public.conversations (id, org_id, kind) values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-00000000fa02', 'family_channel'),
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000fb02', 'family_channel'),
  ('00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-00000000fa02', 'direct');

insert into public.conversation_participants (org_id, conversation_id, membership_id) values
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000a1ce1'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000b0b01'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000da4a1'),
  ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000ca011'),
  ('00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000da4a2'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000a1ce1'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000b0b01');

insert into public.messages (id, org_id, conversation_id, author_membership_id, body) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000a1ce1', 'alice in Family A channel'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000b0b01', 'bob in Family A channel'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000fb02', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000ca011', 'carol in Family B channel'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000d0', '00000000-0000-0000-0000-0000000a1ce1', 'alice DM to bob');

-- Everything below runs as a real authenticated caller.
set local role authenticated;

-- ------------------------------------------------- alice: Family A only
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a11c","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.conversations),
  2,
  'alice sees Family A''s channel and her DM -- not Family B''s channel'
);

select is(
  (select count(*)::int from public.messages),
  3,
  'and the three messages in those two rooms'
);

select is(
  (select count(*)::int from public.messages
    where org_id = '00000000-0000-0000-0000-00000000fb02'),
  0,
  'zero rows from Family B, which she is not in at all'
);

-- --------------------------------- carol: Family B only, and not in A's DM
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ca01","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.conversations),
  1,
  'carol sees only Family B''s channel'
);

select is(
  (select count(*)::int from public.messages),
  1,
  'and only the message in it'
);

-- ---------------------------------------------- THE NAMED EDGE CASE: dana
-- A member of BOTH Families. The subtle failure is not "she sees nothing" --
-- it is that she sees A's content while acting in B, because the scoping keyed
-- on her profile rather than on which membership is in the room.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000da4a","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.conversations),
  2,
  'dana sees exactly two rooms -- one in each of her Families'
);

select is(
  (select array_agg(org_id::text order by org_id::text) from public.conversations),
  array['00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-00000000fb02'],
  'one from Family A and one from Family B, and nothing else'
);

select is(
  (select count(*)::int from public.conversations
    where id = '00000000-0000-0000-0000-0000000000d0'),
  0,
  'she cannot see alice and bob''s DM -- being in Family A is not being in the room'
);

select is(
  (select count(*)::int from public.messages
    where conversation_id = '00000000-0000-0000-0000-0000000000d0'),
  0,
  'nor any message in it'
);

select is(
  (select count(*)::int from public.messages
    where org_id = '00000000-0000-0000-0000-00000000fa02'),
  2,
  'in Family A she sees Family A''s channel messages'
);

select is(
  (select count(*)::int from public.messages
    where org_id = '00000000-0000-0000-0000-00000000fb02'),
  1,
  'and in Family B, Family B''s -- correctly scoped in each, nothing across'
);

-- ------------------------------------------------------------- blocks
-- Invariant 6: hidden from the blocker specifically, not deleted for the room.
reset role;
insert into public.member_blocks (org_id, blocker_membership_id, blocked_membership_id)
values ('00000000-0000-0000-0000-00000000fa02',
        '00000000-0000-0000-0000-0000000da4a1',   -- dana, in Family A
        '00000000-0000-0000-0000-0000000b0b01');  -- blocks bob
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000da4a","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.messages
    where conversation_id = '00000000-0000-0000-0000-0000000000a0'),
  1,
  'after blocking bob, dana sees only alice''s message in the channel'
);

select is(
  (select count(*)::int from public.messages
    where id = '00000000-0000-0000-0000-0000000000f2'),
  0,
  'bob''s message is specifically the one that vanished'
);

-- The other half of the invariant, and the one a "delete it for everyone"
-- implementation would fail.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a11c","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.messages
    where conversation_id = '00000000-0000-0000-0000-0000000000a0'),
  2,
  'and alice still sees both -- the room is unaffected'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000b0b0","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.messages
    where conversation_id = '00000000-0000-0000-0000-0000000000a0'),
  2,
  'and bob, who was blocked, still sees the room normally -- blocking is one-directional'
);

-- -------------------------------------------------------------- writes
--
-- The POSITIVE assertions come first and they are the ones that hold
-- messages_insert honest. A file that only asserts refusals passes just as
-- happily with the INSERT policy deleted entirely -- no policy means no
-- permission means everything is refused, and every "cannot post" assertion
-- goes green for the worst possible reason. Verified: removing
-- messages_insert with only the refusals present failed nothing.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000da4a","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.messages (org_id, conversation_id, author_membership_id, body)
     values ('00000000-0000-0000-0000-00000000fa02',
             '00000000-0000-0000-0000-0000000000a0',
             '00000000-0000-0000-0000-0000000da4a1', 'dana into her own Family A channel') $$,
  'dana CAN post into a room she is a participant of, as her Family A self'
);

select lives_ok(
  $$ insert into public.messages (org_id, conversation_id, author_membership_id, body)
     values ('00000000-0000-0000-0000-00000000fb02',
             '00000000-0000-0000-0000-0000000000b0',
             '00000000-0000-0000-0000-0000000da4a2', 'dana into her own Family B channel') $$,
  'and into her Family B room as her Family B self -- the same person, two memberships'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ca01","role":"authenticated"}', true);

-- Refused by PR 1's child-matches-parent TRIGGER (P0001), not by RLS: a BEFORE
-- trigger runs before the policy's WITH CHECK is evaluated, so RLS never gets
-- asked. Asserted as what it is rather than as 42501 -- the first version of
-- this file claimed "refused by policy" and would have kept claiming it if the
-- policy were deleted. The pure-RLS refusal is the next assertion, where the
-- trigger passes and only the policy can say no.
select throws_like(
  $$ insert into public.messages (org_id, conversation_id, author_membership_id, body)
     values ('00000000-0000-0000-0000-00000000fa02',
             '00000000-0000-0000-0000-0000000000a0',
             '00000000-0000-0000-0000-0000000ca011', 'carol into Family A') $$,
  '%belongs to a different Family%',
  'carol cannot post into a Family A room -- stopped by the integrity trigger, before RLS'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000da4a","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.messages (org_id, conversation_id, author_membership_id, body)
     values ('00000000-0000-0000-0000-00000000fa02',
             '00000000-0000-0000-0000-0000000000d0',
             '00000000-0000-0000-0000-0000000da4a1', 'dana into alice and bob''s DM') $$,
  '42501',
  null,
  'dana cannot post into a DM she is not a participant in -- and here the '
  'trigger PASSES (right Family, own membership), so this is RLS alone'
);

-- A member cannot create the Family channel; only PR 3's automatic path does.
select throws_ok(
  $$ insert into public.conversations (org_id, kind, created_by_membership_id)
     values ('00000000-0000-0000-0000-00000000fa02', 'family_channel',
             '00000000-0000-0000-0000-0000000da4a1') $$,
  '42501',
  null,
  'a member cannot create a second Family channel -- refused by policy'
);

select * from finish();
rollback;
