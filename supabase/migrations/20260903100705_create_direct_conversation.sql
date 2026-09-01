-- Reverse: drop function public.create_direct_conversation(uuid, uuid[]).
--
-- C1, PR 5 of 7. The RPC PR 2 promised.
--
-- PR 2's conversations_select carries an `is_conversation_creator()` clause
-- purely so the creator can read back a room they have not yet joined --
-- because creating a conversation and adding its participants are two
-- statements and PostgREST cannot wrap them in one transaction. That clause is
-- a workaround for a missing transaction, and a half-created room (a
-- conversation with no participants, because the second call failed) is a row
-- nobody can ever reach.
--
-- One function, one transaction, and the two-step disappears.
--
-- REUSES AN EXISTING 1:1 rather than creating a second one. Two people have
-- one conversation, not one per time either of them tapped "message". Without
-- this, a DM list slowly fills with duplicate rooms holding fragments of the
-- same exchange -- and the member has no way to tell which is which, because
-- they are identical apart from their contents.

create or replace function public.create_direct_conversation(
  check_org_id uuid,
  other_membership_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_caller_membership uuid;
  v_all_ids           uuid[];
  v_existing          uuid;
  v_conversation_id   uuid;
begin
  if other_membership_ids is null or cardinality(other_membership_ids) = 0 then
    raise exception 'a direct conversation needs at least one other member';
  end if;

  -- The caller's membership IN THIS FAMILY, resolved here rather than accepted
  -- as an argument. A membership id passed in by the client would be a claim
  -- about who the caller is; auth.uid() is not.
  select m.id into v_caller_membership
    from public.memberships m
   where m.org_id = check_org_id
     and m.profile_id = auth.uid()
     and m.deleted_at is null;

  if v_caller_membership is null then
    raise exception 'not a member of this Family';
  end if;

  -- Everyone named must be an active member of the SAME Family. PR 1's
  -- child-matches-parent trigger would catch this on insert, but raising here
  -- gives the caller a sentence rather than a constraint name.
  if exists (
    select 1 from unnest(other_membership_ids) as requested(id)
     where not exists (
       select 1 from public.memberships m
        where m.id = requested.id
          and m.org_id = check_org_id
          and m.deleted_at is null
     )
  ) then
    raise exception 'every participant must be an active member of this Family';
  end if;

  -- The caller is always in their own conversation, and naming themselves
  -- again must not create a room with a duplicate participant.
  v_all_ids := (
    select array_agg(distinct id)
      from unnest(other_membership_ids || v_caller_membership) as t(id)
  );

  if cardinality(v_all_ids) < 2 then
    raise exception 'a direct conversation needs at least two distinct members';
  end if;

  -- An existing room with EXACTLY this set of participants. Exactly, not
  -- "containing": a 1:1 between two people is a different room from a group of
  -- three that happens to include them both, and merging the two would put a
  -- private exchange in front of a third person.
  select c.id into v_existing
    from public.conversations c
   where c.org_id = check_org_id
     and c.kind = 'direct'
     and c.deleted_at is null
     and (
       select array_agg(cp.membership_id order by cp.membership_id)
         from public.conversation_participants cp
        where cp.conversation_id = c.id
     ) = (select array_agg(id order by id) from unnest(v_all_ids) as t(id))
   limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.conversations (org_id, kind, created_by_membership_id)
  values (check_org_id, 'direct', v_caller_membership)
  returning id into v_conversation_id;

  insert into public.conversation_participants (org_id, conversation_id, membership_id)
  select check_org_id, v_conversation_id, id from unnest(v_all_ids) as t(id);

  return v_conversation_id;
end;
$$;

revoke execute on function public.create_direct_conversation(uuid, uuid[]) from public;
grant execute on function public.create_direct_conversation(uuid, uuid[]) to authenticated, service_role;
