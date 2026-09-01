-- C1 PR 3: the Family channel exists because the Family does.
--
-- The assertions worth having are the ones about paths nobody wrote on
-- purpose: a Family created by a seed, a member re-joining, a role change that
-- must NOT re-add someone who left. The happy path is one assertion; the rest
-- is the reason this lives in the database rather than in the invite flow.

begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- --------------------------------------------------------- the backfill
-- seed.sql's Families predate this migration, so every one of them must have
-- come out of the backfill with a channel and its members in it.
select is(
  (select count(*)::int from public.organizations o
    where not exists (
      select 1 from public.conversations c
       where c.org_id = o.id and c.kind = 'family_channel' and c.deleted_at is null)),
  0,
  'the backfill left no Family without a channel'
);

select is(
  (select count(*)::int
     from public.memberships m
     join public.conversations c
       on c.org_id = m.org_id and c.kind = 'family_channel' and c.deleted_at is null
    where m.deleted_at is null
      and not exists (
        select 1 from public.conversation_participants cp
         where cp.conversation_id = c.id and cp.membership_id = m.id)),
  0,
  'and no active member outside their Family''s channel'
);

-- ------------------------------------------------------- creating one
insert into public.organizations (id, slug, name)
values ('00000000-0000-0000-0000-0000000fc001', '_c1-auto', 'Auto Family');

select is(
  (select count(*)::int from public.conversations
    where org_id = '00000000-0000-0000-0000-0000000fc001' and kind = 'family_channel'),
  1,
  'creating a Family creates its channel, with nobody having asked'
);

select is(
  (select created_by_membership_id from public.conversations
    where org_id = '00000000-0000-0000-0000-0000000fc001' and kind = 'family_channel'),
  null::uuid,
  'attributed to nobody -- there are no memberships yet, and guessing would be a lie'
);

-- ------------------------------------------------------- joining one
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000fc0a1', '_c1-auto-a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000fc0d1', '_c1-auto-m@example.test', 'authenticated', 'authenticated');

insert into public.memberships (id, org_id, profile_id, role) values
  ('00000000-0000-0000-0000-0000000fcaa1', '00000000-0000-0000-0000-0000000fc001',
   '00000000-0000-0000-0000-0000000fc0a1', 'member');

select is(
  (select count(*)::int from public.conversation_participants cp
     join public.conversations c on c.id = cp.conversation_id
    where c.org_id = '00000000-0000-0000-0000-0000000fc001'
      and cp.membership_id = '00000000-0000-0000-0000-0000000fcaa1'),
  1,
  'joining the Family joins its channel'
);

-- A mentor does not count toward the twelve-member cap (lib/family-cap.ts).
-- That is a different question from whether they can read the room, and
-- conflating the two would leave mentors unable to mentor.
insert into public.memberships (id, org_id, profile_id, role) values
  ('00000000-0000-0000-0000-0000000fcdd1', '00000000-0000-0000-0000-0000000fc001',
   '00000000-0000-0000-0000-0000000fc0d1', 'mentor');

select is(
  (select count(*)::int from public.conversation_participants cp
     join public.conversations c on c.id = cp.conversation_id
    where c.org_id = '00000000-0000-0000-0000-0000000fc001'
      and cp.membership_id = '00000000-0000-0000-0000-0000000fcdd1'),
  1,
  'a mentor is in the channel too -- excluded from the cap, not from the room'
);

-- --------------------------------------------- leaving, and coming back
update public.memberships set deleted_at = now()
 where id = '00000000-0000-0000-0000-0000000fcaa1';

-- The participant ROW stays; is_conversation_participant() checks the
-- membership is active, so access ends without destroying the record of who
-- was in the room. C2's threading and K1's Keepsake both need that history.
select is(
  (select count(*)::int from public.conversation_participants
    where membership_id = '00000000-0000-0000-0000-0000000fcaa1'),
  1,
  'leaving does not delete the participant row -- the history survives'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fc0a1","role":"authenticated"}', true);

select is(
  public.is_conversation_participant(
    (select id from public.conversations
      where org_id = '00000000-0000-0000-0000-0000000fc001' and kind = 'family_channel')),
  false,
  'but a departed member is no longer a participant for access purposes'
);

reset request.jwt.claims;

-- Re-joining restores access, and does not create a duplicate row.
update public.memberships set deleted_at = null
 where id = '00000000-0000-0000-0000-0000000fcaa1';

select is(
  (select count(*)::int from public.conversation_participants
    where membership_id = '00000000-0000-0000-0000-0000000fcaa1'),
  1,
  're-joining does not duplicate the participant row'
);

-- ----------------------------------------- the update that must NOT re-add
-- A member who left the ROOM (not the Family) must not be dragged back in by
-- an unrelated update to their membership. This is the assertion that fails if
-- the trigger fires on every UPDATE rather than on deleted_at becoming null.
delete from public.conversation_participants
 where membership_id = '00000000-0000-0000-0000-0000000fcaa1';

update public.memberships set role = 'organizer'
 where id = '00000000-0000-0000-0000-0000000fcaa1';

select is(
  (select count(*)::int from public.conversation_participants
    where membership_id = '00000000-0000-0000-0000-0000000fcaa1'),
  0,
  'a role change does not re-add someone who left the room'
);

-- The assertion above is carried by `after insert or update OF deleted_at` in
-- the trigger declaration -- a role-only update never fires it. This one
-- reaches the guard INSIDE the function: it writes deleted_at, so the trigger
-- fires, but the value is unchanged (null -> null), which is not a
-- reactivation. Measured: without the `old.deleted_at is null` guard the
-- assertion above still passed and only this one failed, so the two are not
-- interchangeable.
update public.memberships set role = 'member', deleted_at = null
 where id = '00000000-0000-0000-0000-0000000fcaa1';

select is(
  (select count(*)::int from public.conversation_participants
    where membership_id = '00000000-0000-0000-0000-0000000fcaa1'),
  0,
  'nor does an update that writes deleted_at without changing it'
);

-- -------------------------------------------------------- idempotence
-- Running the creation twice is a no-op, not a unique violation. The trigger
-- uses ON CONFLICT DO NOTHING precisely so a retried or replayed org insert
-- cannot fail on a room that already exists.
select lives_ok(
  $$ insert into public.conversations (org_id, kind, created_by_membership_id)
     values ('00000000-0000-0000-0000-0000000fc001', 'family_channel', null)
     on conflict do nothing $$,
  'a second channel insert is a no-op, not an error'
);

select is(
  (select count(*)::int from public.conversations
    where org_id = '00000000-0000-0000-0000-0000000fc001' and kind = 'family_channel'),
  1,
  'and there is still exactly one channel'
);

select * from finish();
rollback;
