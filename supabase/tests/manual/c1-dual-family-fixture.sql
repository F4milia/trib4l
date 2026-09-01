-- Hand-check fixture for C1's named edge case.
--
-- The seed alone cannot discriminate: Caregiver Circle holds only Alice and
-- Bob, so every room in it is one Alice belongs to, and "she sees her own
-- rooms" would pass against a policy that simply returned everything in her
-- Families. A third member and a DM she is NOT in is what makes the check
-- capable of failing.

-- Dave already exists (Wellness Guild). A second membership makes him a member
-- of Caregiver Circle too -- which is itself a dual-Family user, and a useful
-- second one.
insert into memberships (id, org_id, profile_id, role)
values ('00000000-0000-0000-0000-0000000d0001',
        '00000000-0000-0000-0000-00000000000a',
        '00000000-0000-0000-0000-0000000000a4', 'member')
on conflict (org_id, profile_id) do nothing;

-- A DM between Bob and Dave, inside Caregiver Circle. Alice is a member of
-- that Family and must still not see this room.
insert into conversations (id, org_id, kind, created_by_membership_id)
values ('00000000-0000-0000-0000-0000000dd001',
        '00000000-0000-0000-0000-00000000000a', 'direct',
        (select id from memberships
          where org_id = '00000000-0000-0000-0000-00000000000a'
            and profile_id = '00000000-0000-0000-0000-0000000000a2'))
on conflict (id) do nothing;

insert into conversation_participants (org_id, conversation_id, membership_id)
select '00000000-0000-0000-0000-00000000000a',
       '00000000-0000-0000-0000-0000000dd001',
       m.id
  from memberships m
 where m.org_id = '00000000-0000-0000-0000-00000000000a'
   and m.profile_id in ('00000000-0000-0000-0000-0000000000a2',
                        '00000000-0000-0000-0000-0000000000a4')
on conflict (conversation_id, membership_id) do nothing;

insert into messages (org_id, conversation_id, author_membership_id, body)
select '00000000-0000-0000-0000-00000000000a',
       '00000000-0000-0000-0000-0000000dd001',
       m.id,
       'BOB-TO-DAVE-PRIVATE'
  from memberships m
 where m.org_id = '00000000-0000-0000-0000-00000000000a'
   and m.profile_id = '00000000-0000-0000-0000-0000000000a2';

-- One message in each Family channel, distinguishable on sight.
insert into messages (org_id, conversation_id, author_membership_id, body)
select c.org_id, c.id, m.id, 'CAREGIVER-CIRCLE-CHANNEL'
  from conversations c
  join memberships m on m.org_id = c.org_id
                    and m.profile_id = '00000000-0000-0000-0000-0000000000a2'
 where c.org_id = '00000000-0000-0000-0000-00000000000a' and c.kind = 'family_channel';

insert into messages (org_id, conversation_id, author_membership_id, body)
select c.org_id, c.id, m.id, 'FOUNDER-COLLECTIVE-CHANNEL'
  from conversations c
  join memberships m on m.org_id = c.org_id
                    and m.profile_id = '00000000-0000-0000-0000-0000000000a3'
 where c.org_id = '00000000-0000-0000-0000-00000000000b' and c.kind = 'family_channel';
