-- Reverse: restore the previous body of public.audit_row_change().
--
-- PR 3/5, part 1. Teaches audit_row_change() how to resolve org_id for tables
-- that do not carry one, without teaching it about specific tables.
--
-- The mode arrives as a trigger argument, so each trigger declares its own
-- intent where it is attached and the function stays generic. The 25 triggers
-- from PR 2/5 pass no argument and default to 'row', so their behaviour is
-- unchanged -- 020's assertions still cover them.
--
-- Modes are a closed set and 'order' names public.orders literally. No dynamic
-- SQL: a SECURITY DEFINER function that built a table name from an argument
-- would be a privilege-escalation surface even though trigger arguments are
-- not attacker-controlled today.

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
-- pg_temp explicit and last: an empty pin leaves it implicitly ahead of
-- pg_catalog, where a caller-created temporary domain could shadow an
-- unqualified type and run its CHECK with definer privileges.
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row     jsonb;
  v_before  jsonb;
  v_changed text[];
  v_meta    jsonb := '{}'::jsonb;
  v_mode    text  := coalesce(tg_argv[0], 'row');
  v_org_id  uuid;
begin
  if tg_table_name = 'audit_log' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  case v_mode
    when 'row' then
      -- The table carries org_id. Absent column yields null, which is correct
      -- for a genuinely org-less table such as blocks or profiles.
      v_org_id := nullif(v_row ->> 'org_id', '')::uuid;
    when 'self' then
      -- organizations: the row IS the Family.
      v_org_id := nullif(v_row ->> 'id', '')::uuid;
    when 'order' then
      -- order_items and anything else hanging off an order. Null if the parent
      -- is already gone -- a cascading delete may remove it first, and an
      -- honest null beats a guess.
      select o.org_id into v_org_id
        from public.orders o
       where o.id = nullif(v_row ->> 'order_id', '')::uuid;
    else
      raise exception
        'audit_row_change: unknown org resolution mode %, expected row, self or order', v_mode;
  end case;

  -- Column NAMES only, never values (invariants 3 and 4).
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
    auth.uid(),
    v_org_id,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    v_meta
  );

  return null;
end;
$$;

comment on function public.audit_row_change() is
  'Generic audit trigger. Writes one audit_log row per affected row, in the '
  'same transaction as the mutation. metadata carries changed column names '
  'only, never values. Takes an optional org resolution mode as a trigger '
  'argument: row (default, read org_id off the row), self (the row is the '
  'org), order (resolve through public.orders). SECURITY DEFINER so it '
  'outranks audit_log''s insert policy -- a service-role write has no '
  'auth.uid() and could not otherwise be logged.';

revoke execute on function public.audit_row_change() from public;
