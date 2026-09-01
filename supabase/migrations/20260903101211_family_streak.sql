-- Reverse: drop function public.family_streak(uuid); drop function
-- public.family_table_day(uuid).

-- Schema session, PR 8. Ferenz 1.3. D1's element 5, "the streak".
--
-- DERIVED, NOT STORED. A counter column would need an Inngest job per Family
-- per day, can drift from the entries it summarises, and has to be repaired by
-- hand after any backfill or entry deletion. This is a pure function of the
-- Family's entry dates, so it cannot drift; the cost is a query per dashboard
-- load, which table_entries_org_date_idx serves.
--
-- WHAT "STREAK" MEANS HERE, spelled out because it is NOT the usual thing and
-- the next reader will assume it is. Spec 2.1 (F1.3):
--
--   "Streak is Family-level, and a missed day HOLDS the streak at its current
--    value rather than resetting to zero."
--
-- Nothing resets it. So the streak is the count of DISTINCT DAYS the Family
-- has shown up -- ever. A missed day does not increment it and does not clear
-- it; the next day with an entry increments it again.
--
-- That is a deliberate product choice, not a simplification: F4milia does not
-- punish a Family for a hard week, which is the same instinct behind Hurt/Repair
-- and the Care Actions. If someone later "fixes" this into a conventional
-- consecutive-day streak that resets on a gap, the three assertions spec 2.1
-- names -- a missed day, several consecutive misses, broken-then-resumed -- all
-- fail. They are regression guards against exactly that well-meaning change.
--
-- Family-level means ANY member's entry counts for the Family that day. One
-- person showing up is the Family showing up; requiring all twelve would make
-- the streak a measure of the least available member.

create or replace function public.family_streak(p_org_id uuid)
returns integer
language sql
stable
as $$
  select count(distinct e.entry_date)::integer
    from public.table_entries e
   where e.org_id = p_org_id
     and e.deleted_at is null;
$$;

comment on function public.family_streak(uuid) is
  'Distinct days this Family has written at least one Table entry. A missed day '
  'HOLDS the value rather than resetting it (F1.3), so nothing ever decreases '
  'it. SECURITY INVOKER: counts only entries the caller can see.';

/**
 * D1's element 4, "today's Table prompt status", for one member.
 *
 * Returns the member's entry for the Family's TODAY, or no row. "Today" is
 * resolved against organizations.timezone rather than the server clock,
 * because F1.2 creates the daily opportunity "respecting each Family's IANA
 * timezone" -- a Family in Auckland and one in Los Angeles do not change day
 * together, and a UTC `current_date` would give one of them the wrong answer
 * for most of its evening.
 *
 * No row means "not written yet", which is what the honest empty state renders
 * from. It does NOT mean the member has no prompt.
 */
create or replace function public.family_table_day(p_org_id uuid)
returns table (
  family_date date,
  entry_id uuid,
  written boolean
)
language sql
stable
as $$
  select d.family_date,
         e.id,
         e.id is not null
    from (
      select (now() at time zone o.timezone)::date as family_date
        from public.organizations o
       where o.id = p_org_id
    ) d
    left join public.table_entries e
      on e.org_id = p_org_id
     and e.entry_date = d.family_date
     and e.deleted_at is null
     and e.member_id in (
       select m.id from public.memberships m
        where m.org_id = p_org_id
          and m.profile_id = auth.uid()
          and m.deleted_at is null);
$$;

comment on function public.family_table_day(uuid) is
  'The Family''s current date in ITS timezone, and the calling member''s entry '
  'for that date if they have written one. SECURITY INVOKER, so both the '
  'organization row and the entry are read through RLS.';

-- Both are SECURITY INVOKER, which is the whole point: they read organizations,
-- memberships and table_entries, all RLS-protected, and invariant 5 says every
-- new read path goes THROUGH policy rather than around it with filtering bolted
-- on top. As definer functions either one would answer for any org_id a caller
-- guessed -- family_streak would leak how active another Family is, which is
-- exactly the kind of aggregate leak C1 PR4 found in the unread counts.
--
-- No grant to service_role: nothing server-side needs either of these, and
-- family_table_day depends on auth.uid() so it would return nothing useful.
revoke execute on function public.family_streak(uuid) from public;
revoke execute on function public.family_table_day(uuid) from public;
grant execute on function public.family_streak(uuid) to authenticated;
grant execute on function public.family_table_day(uuid) to authenticated;
