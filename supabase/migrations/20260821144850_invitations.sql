-- Reverse: revoke execute on accept_invitation from authenticated, drop
-- function accept_invitation, drop policies on invitations (select/insert/
-- update), revoke grants, disable RLS, drop table invitations, drop
-- function current_user_email.

-- Needed because `profiles` deliberately has no email column (identity is
-- global, but email is an auth concern, not a profile concern) -- yet the
-- invitation flow has to compare "who is this invite for" against "who is
-- currently signed in." SECURITY DEFINER so it can read auth.users; scoped
-- to the caller's own row only, so it can't be used to look up anyone
-- else's email.
create or replace function current_user_email()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email from auth.users where id = auth.uid();
$$;

create type invitation_status as enum ('pending', 'accepted', 'revoked');

-- No `deleted_at`: an invitation's lifecycle is fully captured by `status`
-- plus `accepted_at`, and the plan's soft-delete policy is about
-- user-generated content, not this kind of transactional workflow record.
create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  email text not null,
  role membership_role not null default 'member',
  invited_by_profile_id uuid not null references profiles (id) on delete set null,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status invitation_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz
);

create index invitations_org_id_idx on invitations (org_id);
create index invitations_email_idx on invitations (email);

alter table invitations enable row level security;
grant select, insert, update on invitations to authenticated;

-- Visible to: whoever it's addressed to (so they can discover and accept
-- it after signing in, regardless of whether their account existed before
-- the invite was sent -- this is the mechanism, not a special case), the
-- org staff who manage invitations for their org, and platform_admin.
create policy invitations_select on invitations
  for select to authenticated
  using (
    email = current_user_email()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

create policy invitations_insert on invitations
  for insert to authenticated
  with check (
    invited_by_profile_id = auth.uid()
    and (
      has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
      or is_platform_admin()
    )
  );

-- Only for revoking (org staff) -- acceptance goes exclusively through the
-- accept_invitation() function below, never through a direct row update,
-- so "the invited user can mark their own invite accepted" is not a policy
-- that has to be gotten right; it doesn't exist.
create policy invitations_update on invitations
  for update to authenticated
  using (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin())
  with check (has_org_role(org_id, array['organizer', 'org_owner']::membership_role[]) or is_platform_admin());

-- The one path to redeem an invitation. SECURITY DEFINER so it can insert
-- into `memberships` on the caller's behalf even though they don't yet
-- hold organizer/org_owner in that org (the normal memberships_insert
-- policy requirement) -- the validation inside this function (correct
-- token, pending, not expired, email matches the caller) is what makes
-- that safe. `on conflict ... do update` is the plan's specifically-called-
-- out case: re-inviting someone who already has a membership row updates
-- their role instead of erroring.
create or replace function accept_invitation(invitation_token text)
returns memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations;
  caller_email text;
  result memberships;
begin
  caller_email := current_user_email();
  if caller_email is null then
    raise exception 'Must be signed in to accept an invitation';
  end if;

  select * into inv from invitations
    where token = invitation_token
    for update;

  if inv is null then
    raise exception 'Invitation not found';
  end if;

  if inv.status <> 'pending' then
    raise exception 'Invitation is no longer pending';
  end if;

  if inv.expires_at <= now() then
    raise exception 'Invitation has expired';
  end if;

  if inv.email <> caller_email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  insert into memberships (org_id, profile_id, role)
  values (inv.org_id, auth.uid(), inv.role)
  on conflict (org_id, profile_id)
  do update set role = excluded.role, deleted_at = null, updated_at = now()
  returning * into result;

  update invitations set status = 'accepted', accepted_at = now() where id = inv.id;

  return result;
end;
$$;

grant execute on function accept_invitation(text) to authenticated;
