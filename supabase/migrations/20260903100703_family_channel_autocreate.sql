-- Reverse: drop trigger memberships_join_family_channel on memberships; drop
--   trigger organizations_create_family_channel on organizations; drop function
--   public.add_membership_to_family_channel(); drop function
--   public.create_family_channel().
--
-- C1, PR 3 of 7. "One Family-wide channel per Family created automatically."
--
-- IN THE DATABASE, NOT IN THE APP. A Family whose channel depends on the code
-- path that happened to create it is a Family that sometimes has no channel --
-- an org created by the invite flow, by a seed script, by a backfill, or by an
-- admin action would each need to remember. The channel is a property of a
-- Family existing, so it is created where Families come into existence.
--
-- SECURITY DEFINER: PR 2's conversations_insert policy deliberately refuses
-- kind = 'family_channel' to every member. This is the path that is allowed to
-- create one, and it is not reachable from a client -- it only runs as part of
-- an organizations INSERT that already succeeded.

create or replace function public.create_family_channel()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  -- created_by_membership_id is null on purpose: at the moment a Family is
  -- created there are no memberships yet, and attributing the room to whoever
  -- happens to be added first would be a small lie in the audit trail.
  insert into public.conversations (org_id, kind, created_by_membership_id)
  values (new.id, 'family_channel', null)
  -- The Family channel is a fact about the Family, so a second attempt is a
  -- no-op rather than an error. Matches the unique index from PR 1, which is
  -- what actually holds the invariant.
  on conflict do nothing;

  return null;
end;
$$;

-- Every active member of the Family belongs to its channel. Mentors included:
-- lib/family-cap.ts excludes them from the TWELVE-MEMBER CAP, which is a
-- different question from whether they can read the room. A mentor who cannot
-- see the Family channel cannot mentor.
create or replace function public.add_membership_to_family_channel()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_conversation_id uuid;
begin
  -- Only active memberships. A membership inserted already soft-deleted is not
  -- a member, and re-activating one is handled below.
  if new.deleted_at is not null then
    return null;
  end if;

  -- On UPDATE this fires only when the membership has just become active
  -- again; an ordinary update (a role change, a display tweak) must not
  -- re-add someone who deliberately left the room.
  if tg_op = 'UPDATE' and old.deleted_at is null then
    return null;
  end if;

  select c.id into v_conversation_id
    from public.conversations c
   where c.org_id = new.org_id
     and c.kind = 'family_channel'
     and c.deleted_at is null;

  -- A Family with no channel is possible only for rows that predate this
  -- migration and were not backfilled -- do nothing rather than abort the
  -- membership write. Invariant 5's principle: metadata about a write must
  -- never abort the write.
  if v_conversation_id is null then
    return null;
  end if;

  insert into public.conversation_participants (org_id, conversation_id, membership_id)
  values (new.org_id, v_conversation_id, new.id)
  on conflict (conversation_id, membership_id) do nothing;

  return null;
end;
$$;

revoke execute on function public.create_family_channel() from public;
revoke execute on function public.add_membership_to_family_channel() from public;

create trigger organizations_create_family_channel
  after insert on organizations
  for each row execute function public.create_family_channel();

create trigger memberships_join_family_channel
  after insert or update of deleted_at on memberships
  for each row execute function public.add_membership_to_family_channel();

-- ===== backfill =====
-- Existing Families predate the trigger. Written as set operations against the
-- same rules the triggers apply, so the two cannot drift.

insert into public.conversations (org_id, kind, created_by_membership_id)
select o.id, 'family_channel', null
  from public.organizations o
 where not exists (
   select 1 from public.conversations c
    where c.org_id = o.id and c.kind = 'family_channel' and c.deleted_at is null
 );

insert into public.conversation_participants (org_id, conversation_id, membership_id)
select m.org_id, c.id, m.id
  from public.memberships m
  join public.conversations c
    on c.org_id = m.org_id and c.kind = 'family_channel' and c.deleted_at is null
 where m.deleted_at is null
on conflict (conversation_id, membership_id) do nothing;
