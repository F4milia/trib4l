-- Reverse: drop each trigger named <table>_audit on the tables listed below.
--
-- PR 3/5, part 2. The five tables PR 2/5 could not cover, because none carries
-- a usable org_id on the row. With these attached, every table in public has an
-- audit trigger except audit_log (recursion), idempotency_keys and
-- webhook_events (infrastructure). PR 5/5 adds the guard that fails CI when a
-- new table is missing one.

do $$
declare
  v_spec record;
  v_specs constant text[][] := array[
    -- table,           org resolution mode
    ['organizations',   'self'],   -- the row is the Family
    ['order_items',     'order'],  -- through the parent order
    ['blocks',          'row'],    -- platform-wide block list, genuinely org-less
    ['platform_staff',  'row'],    -- platform-level
    ['profiles',        'row']     -- user-level
  ];
  i int;
begin
  for i in 1 .. array_length(v_specs, 1) loop
    if not exists (
      select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = v_specs[i][1] and c.relkind = 'r'
    ) then
      raise exception 'audit trigger target public.% does not exist', v_specs[i][1];
    end if;

    execute format('drop trigger if exists %I on public.%I',
                   v_specs[i][1] || '_audit', v_specs[i][1]);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function public.audit_row_change(%L)',
      v_specs[i][1] || '_audit', v_specs[i][1], v_specs[i][2]
    );
  end loop;
end;
$$;
