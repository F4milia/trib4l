-- Reverse: drop function is_platform_admin, drop function is_platform_staff,
-- drop function shares_org_with, drop function has_org_role, drop function
-- is_org_member.
--
-- All SECURITY DEFINER: policies on `memberships` and `platform_staff` need
-- to query those same tables to decide access, which would recurse into RLS
-- forever if evaluated as the calling role. Running as the function owner
-- (postgres, which bypasses RLS) breaks that cycle. This is the standard
-- fix for self-referential RLS checks, not a shortcut — these functions are
-- deliberately narrow (they return a boolean, never row data) so they can't
-- be used to smuggle data out from under RLS.

create or replace function is_org_member(check_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships
    where org_id = check_org_id
      and profile_id = auth.uid()
      and deleted_at is null
  );
$$;

create or replace function has_org_role(check_org_id uuid, allowed_roles membership_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships
    where org_id = check_org_id
      and profile_id = auth.uid()
      and deleted_at is null
      and role = any(allowed_roles)
  );
$$;

-- True if the caller shares at least one org with the given profile. Used
-- to scope `profiles` reads: identity is global, but a member of Org A
-- should never be able to browse the profile of someone who's only ever
-- been in Org C.
create or replace function shares_org_with(target_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from memberships m1
    join memberships m2 on m1.org_id = m2.org_id
    where m1.profile_id = auth.uid()
      and m1.deleted_at is null
      and m2.profile_id = target_profile_id
      and m2.deleted_at is null
  );
$$;

create or replace function is_platform_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from platform_staff
    where profile_id = auth.uid()
      and revoked_at is null
  );
$$;

-- The platform_admin bypass. Deliberately requires aal2 (MFA-verified) on
-- top of platform_staff membership -- Invariant 3 requires 2FA on every
-- platform_staff account, and a bypass clause that only checked table
-- membership would grant cross-org access to a password-only session.
create or replace function is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_platform_staff()
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
