-- Reverse: drop policies + revoke grants + disable RLS on
-- mentor_pairings; drop trigger mentor_pairings_transition_check, drop
-- function check_mentor_pairing_transition; drop function
-- designate_mentor.

alter table mentor_pairings enable row level security;
grant select, insert, update on mentor_pairings to authenticated;

create policy mentor_pairings_select on mentor_pairings
  for select to authenticated
  using (
    mentor_profile_id = auth.uid()
    or mentee_profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- Only staff propose a pairing, and only into 'proposed' -- nobody can
-- insert a pairing that's already active/completed/declined.
create policy mentor_pairings_insert on mentor_pairings
  for insert to authenticated
  with check (
    proposed_by_profile_id = auth.uid()
    and status = 'proposed'
    and (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  );

-- Coarse gate only: "you're a party to this pairing, or you're staff."
-- Which specific transitions each of those callers may actually make
-- (mentor accepts; mentor, mentee, or staff declines/completes) is
-- enforced by the trigger below, not here -- a state machine with a
-- different allowed caller per edge doesn't fit cleanly into a single
-- boolean USING/WITH CHECK expression the way "is this row yours" does.
create policy mentor_pairings_update on mentor_pairings
  for update to authenticated
  using (
    mentor_profile_id = auth.uid()
    or mentee_profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  )
  with check (
    mentor_profile_id = auth.uid()
    or mentee_profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create or replace function check_mentor_pairing_transition()
returns trigger
language plpgsql
as $$
begin
  if new.org_id is distinct from old.org_id
    or new.mentor_profile_id is distinct from old.mentor_profile_id
    or new.mentee_profile_id is distinct from old.mentee_profile_id
    or new.proposed_by_profile_id is distinct from old.proposed_by_profile_id
  then
    raise exception 'mentor_pairings: org_id, mentor_profile_id, mentee_profile_id, and proposed_by_profile_id cannot be changed after creation';
  end if;

  new.updated_at := now();

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'proposed' and new.status = 'active' then
    if auth.uid() is distinct from old.mentor_profile_id then
      raise exception 'Only the mentor can accept a proposed pairing';
    end if;
    new.activated_at := now();
  elsif old.status = 'proposed' and new.status = 'declined' then
    if auth.uid() is distinct from old.mentor_profile_id
      and auth.uid() is distinct from old.mentee_profile_id
      and not has_org_role(old.org_id, array['organizer', 'org_owner']::membership_role[])
      and not is_platform_admin()
    then
      raise exception 'Only a party to the pairing or org staff can decline it';
    end if;
    new.declined_at := now();
  elsif old.status = 'active' and new.status = 'completed' then
    if auth.uid() is distinct from old.mentor_profile_id
      and auth.uid() is distinct from old.mentee_profile_id
      and not has_org_role(old.org_id, array['organizer', 'org_owner']::membership_role[])
      and not is_platform_admin()
    then
      raise exception 'Only a party to the pairing or org staff can complete it';
    end if;
    new.completed_at := now();
  else
    raise exception 'Invalid mentor pairing status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

create trigger mentor_pairings_transition_check
  before update on mentor_pairings
  for each row execute function check_mentor_pairing_transition();

-- The member -> mentor transition itself: an explicit action with its own
-- record (an audit_log entry), not a bare role edit -- exactly what the
-- plan calls for ("build the member -> mentor transition as an explicit,
-- first-class action with its own record and UI moment"). Restricted to
-- promoting a plain 'member': demoting an organizer/org_owner into
-- 'mentor' isn't what this action means and isn't supported here. Not
-- SECURITY DEFINER: both the UPDATE and the audit_log INSERT run under the
-- caller's own already-permitted RLS (memberships_update already requires
-- org_owner, per Session 2's role-escalation design -- this function adds
-- atomicity across the role change and its audit record, not privilege).
create or replace function designate_mentor(target_org_id uuid, target_profile_id uuid)
returns memberships
language plpgsql
as $$
declare
  result memberships;
begin
  update memberships set role = 'mentor'
    where org_id = target_org_id
      and profile_id = target_profile_id
      and role = 'member'
      and deleted_at is null
  returning * into result;

  if result is null then
    raise exception 'Membership not found, not a plain member, or not permitted';
  end if;

  insert into audit_log (actor_profile_id, org_id, action, target_type, target_id, metadata)
  values (auth.uid(), target_org_id, 'designate_mentor', 'memberships', result.id, jsonb_build_object('profile_id', target_profile_id));

  return result;
end;
$$;

grant execute on function designate_mentor(uuid, uuid) to authenticated;
