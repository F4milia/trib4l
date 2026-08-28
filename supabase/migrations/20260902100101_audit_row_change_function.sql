-- Reverse: drop function public.audit_row_change();
--
-- The generic audit trigger function. Attached to nothing by this migration --
-- PR 2 attaches it to the org-scoped tables, PR 3 to the special cases.
--
-- Why the database and not the app layer: CLAUDE.md invariant 5 says every
-- mutation writes to audit_log. Enforcing that from 38 server actions makes it
-- a convention 38 call sites have to remember, leaves the eight rpc() paths
-- logging a compound operation as one line, cannot be atomic (the Supabase
-- client has no transactions, so the mutation commits before the log write is
-- even attempted), and cannot see a service-role write at all. A trigger is in
-- the same transaction as the mutation and fires wherever the write came from.

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
-- Mandatory, not stylistic: a SECURITY DEFINER function with a mutable
-- search_path is a privilege-escalation vector.
--
-- pg_temp is listed EXPLICITLY and LAST. An empty search_path is not enough:
-- Postgres searches pg_temp implicitly *first* unless the path names it, so a
-- caller with temp-create rights could define a temporary domain shadowing an
-- unqualified `uuid`, `text` or `jsonb` reference and have its CHECK
-- constraint execute with this function's privileges. Naming pg_temp last
-- moves it behind pg_catalog. This is the hardening Postgres' own SECURITY
-- DEFINER guidance prescribes.
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row     jsonb;
  v_before  jsonb;
  v_changed text[];
  v_meta    jsonb := '{}'::jsonb;
begin
  -- Defensive: audit_log must never audit itself. PR 2 does not attach the
  -- trigger here, but a later migration might, and the failure mode is
  -- unbounded recursion inside someone else's transaction.
  if tg_table_name = 'audit_log' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  -- Column NAMES only, never values. The log records that `body` changed, not
  -- what it changed to -- invariants 3 and 4 by construction rather than by a
  -- reviewer noticing.
  if tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    select coalesce(array_agg(e.key order by e.key), '{}')
      into v_changed
      from jsonb_each(v_row) as e(key, value)
     where v_before -> e.key is distinct from e.value;
    v_meta := jsonb_build_object('changed', to_jsonb(v_changed));
  end if;

  insert into public.audit_log (
    actor_profile_id, org_id, action, target_type, target_id, metadata
  ) values (
    -- Null for a webhook or service-role write, which has no JWT. "The system
    -- did this" is a true statement; the column already allows it.
    auth.uid(),
    nullif(v_row ->> 'org_id', '')::uuid,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    v_meta
  );

  return null;  -- AFTER trigger: the return value is ignored
end;
$$;

comment on function public.audit_row_change() is
  'Generic audit trigger. Writes one audit_log row per affected row, in the '
  'same transaction as the mutation. metadata carries changed column names '
  'only, never values. SECURITY DEFINER so it outranks audit_log''s insert '
  'policy -- a service-role write has no auth.uid() and could not otherwise '
  'be logged.';

-- Nothing calls this directly; it raises outside a trigger context anyway.
revoke execute on function public.audit_row_change() from public;
