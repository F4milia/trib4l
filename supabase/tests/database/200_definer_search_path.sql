-- Stream A unblocking, PR 2.
--
-- A closed-set guard, deliberately. It does not assert "these 15 functions are
-- fixed" -- it asserts that NO security-definer function in public leaves
-- pg_temp implicit, so a new definer function written the old way fails here
-- rather than shipping.
--
-- The subtlety worth stating: `set search_path = public` LOOKS like a pinned
-- path and is not. Postgres searches the temporary schema first for relations
-- whenever pg_temp is not named, so the setting that appears to lock the path
-- is the one that leaves it open. That is why the assertion is about pg_temp's
-- POSITION and not merely its presence -- naming it first would be equally
-- broken and would still contain the string.

begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

-- Every definer function carries an explicit search_path at all. A function
-- with proconfig null inherits the caller's path entirely, which is strictly
-- worse than pinning it to public.
select is_empty(
  $$
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.proconfig is null
  $$,
  'every SECURITY DEFINER function in public sets search_path explicitly'
);

-- pg_temp is named. Without it the temporary schema is searched FIRST for
-- relations, so a temp table shadowing platform_staff makes is_platform_admin()
-- return true for a plain member.
select is_empty(
  $$
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and not exists (
         select 1 from unnest(p.proconfig) as c(setting)
          where c.setting like 'search_path=%'
            and ('pg_temp' = any(
              string_to_array(replace(split_part(c.setting, '=', 2), ' ', ''), ',')
            ))
       )
  $$,
  'every SECURITY DEFINER function in public names pg_temp'
);

-- ...and names it LAST. Position is the whole point: pg_temp first is the
-- default behaviour this migration exists to remove.
select is_empty(
  $$
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and exists (
         select 1 from unnest(p.proconfig) as c(setting)
          where c.setting like 'search_path=%'
            and 'pg_temp' <> (
              select parts[array_length(parts, 1)]
                from (
                  select string_to_array(
                    replace(split_part(c.setting, '=', 2), ' ', ''), ','
                  ) as parts
                ) s
            )
       )
  $$,
  'every SECURITY DEFINER function in public names pg_temp LAST'
);

-- The two the whole RLS layer runs through, asserted by name so a future
-- refactor that drops their setting fails with a message that says which.
select is(
  (select array_agg(p.proname order by p.proname)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_org_member', 'has_org_role')
      and 'search_path=public, pg_temp' = any(p.proconfig)),
  array['has_org_role', 'is_org_member']::name[],
  'is_org_member() and has_org_role() -- called by all 48 role-checking '
  'policies -- both name pg_temp last'
);

select * from finish();
rollback;
