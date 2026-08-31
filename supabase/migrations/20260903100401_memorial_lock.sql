-- Reverse: drop function public.unmemorialize_profile(uuid), drop function
-- public.memorialize_profile(uuid), restore delete_my_account() to its previous
-- body, alter table profiles drop column memorialized_by, drop column
-- memorialized_at.

-- Memorial-lock: the state that preserves a person's identity and contributions
-- after they die, instead of erasing them. Decisions taken by James, 2026-09-01,
-- all as option (a):
--
--   1. Set by platform staff, on a Family's request -- not by the Family
--      directly. Getting it wrong locks a LIVING member out of their own
--      account, and a grieving Family is not the right place for that button.
--   2. Reversible by staff, and recorded. A mistake must be fixable.
--   3. A deletion request does NOT override it. Memorial-lock wins.
--   4. A prior self-deletion stands: if they anonymised themselves while alive,
--      memorial-lock does not bring the name back.
--   5. Ledger slices freeze exactly as recorded, in their name.
--
-- WHY THIS INVERTS EVERY OTHER DELETION PATH, stated first because it is the
-- whole point. Ordinary deletion replaces display_name with 'Deleted user'.
-- Memorial-lock keeps the real name, on purpose, because a Family's record of
-- someone who has died is the thing worth protecting. Any code that treats a
-- memorialised member as an ordinary deletion reads correctly, passes review,
-- and passes every assertion written before this migration -- because all of
-- them check that the name WAS replaced. The result would be a Family opening
-- their record to find the person they lost listed as "Deleted user", with no
-- undo. That is the failure this file exists to make impossible.
--
-- ON THE LEDGER (decision 5). Nothing to do here yet: there are no contribution
-- tables in this repository. When they arrive, slices are frozen as recorded and
-- attributed by name -- the same rule as everything else here, and the reason
-- this comment exists rather than a TODO nobody would find.

alter table profiles
  add column memorialized_at timestamptz,
  add column memorialized_by uuid references profiles (id) on delete set null;

comment on column profiles.memorialized_at is
  'Set when this account is memorial-locked: frozen, and the real name KEPT on '
  'everything they wrote. The inverse of deleted_at, which replaces the name. '
  'Never scrub the display_name of a row where this is set.';

-- "This person has died" is a question a Family answers, not a query, so the
-- lookup is by state rather than by date range. Partial, because the rows that
-- carry it will always be a tiny minority.
create index profiles_memorialized_at_idx on profiles (memorialized_at)
  where memorialized_at is not null;

/**
 * Memorial-locks an account. Staff only, and reversible.
 *
 * is_platform_admin() rather than is_platform_staff(): it is
 * `is_platform_staff() and aal = 'aal2'`, so this requires a staff member who
 * has presented a two-factor code in this session. For an action that freezes
 * somebody out of their account permanently-until-reversed, a password alone is
 * not enough.
 *
 * Returns false rather than raising for a caller who is not staff, and says
 * nothing about whether the profile exists -- the two are indistinguishable from
 * outside, which is deliberate.
 *
 * IT DOES NOT TOUCH display_name, and that is decision 4 in one line: if this
 * person already anonymised themselves while alive, their choice stands and the
 * name stays 'Deleted user'. Memorial-lock preserves what is there; it never
 * restores what somebody chose to remove.
 */
create function public.memorialize_profile(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_platform_admin() then
    return false;
  end if;

  update public.profiles
     set memorialized_at = now(),
         memorialized_by = v_actor
   where id = p_profile_id
     and memorialized_at is null;

  if not found then
    return false;
  end if;

  insert into public.audit_log (actor_profile_id, org_id, action, target_type, target_id)
  values (v_actor, null, 'profile.memorialized', 'profile', p_profile_id);

  return true;
end;
$$;

/**
 * Reverses it (decision 2). Same staff gate, same audit discipline.
 *
 * This exists because the alternative to a reversible mistake is a living member
 * permanently frozen out of their own account with no route back. The audit rows
 * are what make "who did this, and who undid it" answerable afterwards.
 *
 * Clearing the state does not restore anything either: nothing was removed on
 * the way in, so there is nothing to put back.
 */
create function public.unmemorialize_profile(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_platform_admin() then
    return false;
  end if;

  update public.profiles
     set memorialized_at = null,
         memorialized_by = null
   where id = p_profile_id
     and memorialized_at is not null;

  if not found then
    return false;
  end if;

  insert into public.audit_log (actor_profile_id, org_id, action, target_type, target_id)
  values (v_actor, null, 'profile.unmemorialized', 'profile', p_profile_id);

  return true;
end;
$$;

/**
 * delete_my_account(), replaced -- everything as before, plus one refusal at the
 * top.
 *
 * Decision 3: a deletion request does not override memorial-lock. So this
 * declines rather than scrubbing, and records the refusal, because "somebody
 * with this account's credentials asked us to erase a memorialised person" is
 * exactly the event a Family or a court might later ask about.
 *
 * REFUSING IS ALSO THE SAFE SHAPE IF THE POLICY EVER CHANGES. Nothing is
 * destroyed, so allowing it later is a one-line change; had it scrubbed, the
 * names would already be gone and no later decision could bring them back.
 *
 * The rest of the body is unchanged from 20260903100301, and the four policy
 * steps still read the same way -- see that file for why each one is what it is.
 */
create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid := auth.uid();
  v_memorialized boolean;
begin
  if v_profile_id is null then
    return false;
  end if;

  select memorialized_at is not null into v_memorialized
    from public.profiles where id = v_profile_id;

  if v_memorialized then
    insert into public.audit_log (actor_profile_id, org_id, action, target_type, target_id)
    values (v_profile_id, null, 'account.deletion_refused', 'profile', v_profile_id);
    return false;
  end if;

  if exists (
    select 1 from public.profiles
     where id = v_profile_id and deleted_at is not null
  ) then
    return false;
  end if;

  update public.profiles
     set deleted_at = now(),
         display_name = 'Deleted user',
         avatar_url = null
   where id = v_profile_id;

  update public.org_profiles
     set deleted_at = now(),
         display_name = null,
         avatar_url = null
   where profile_id = v_profile_id;

  update public.memberships
     set deleted_at = now()
   where profile_id = v_profile_id;

  delete from auth.sessions where user_id = v_profile_id;

  insert into public.audit_log (actor_profile_id, org_id, action, target_type, target_id)
  values (v_profile_id, null, 'account.deleted', 'profile', v_profile_id);

  return true;
end;
$$;

-- Both new functions are EXECUTE-to-PUBLIC on creation, so these revokes are the
-- access control. `authenticated` may call them; the staff check inside is what
-- decides whether anything happens.
revoke all on function public.memorialize_profile(uuid) from public;
revoke all on function public.unmemorialize_profile(uuid) from public;
grant execute on function public.memorialize_profile(uuid) to authenticated;
grant execute on function public.unmemorialize_profile(uuid) to authenticated;
