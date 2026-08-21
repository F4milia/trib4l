-- Reverse: revoke execute on am_i_platform_admin from authenticated, drop
-- function am_i_platform_admin.

-- The app layer (route guards for /admin pages) needs to ask "is the
-- current caller platform_admin?" without being able to query
-- platform_staff rows directly for that purpose -- exposing the existing
-- SECURITY DEFINER check as a callable RPC is simpler and clearer than
-- relying on "can I see my own platform_staff row" as an indirect signal.
create or replace function am_i_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select is_platform_admin();
$$;

grant execute on function am_i_platform_admin() to authenticated;
