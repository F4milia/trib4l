-- Reverse: drop each trigger named <table>_audit on the tables listed below.
--
-- PR 2/5. Attaches audit_row_change() (PR 1/5) to every table carrying both
-- org_id and id. This is the commit where invariant 5 -- "every mutation writes
-- to audit_log" -- starts being true, for these 25 tables, regardless of
-- whether the write came from a server action, an rpc, a webhook running as
-- service_role, or psql.
--
-- The table list is spelled out rather than discovered at runtime so that it is
-- greppable and reviewable: a reader can see exactly what is covered, and
-- adding a table is a visible diff rather than a silent consequence. PR 5/5
-- adds the pgTAP guard that fails CI when a new table is missing from it.
--
-- Deliberately NOT included:
--   audit_log        -- would recurse; the function guards this too
--   idempotency_keys -- infrastructure, and has no id column
--   webhook_events   -- infrastructure
--   organizations, order_items, blocks, platform_staff, profiles
--                    -- no usable org_id on the row; PR 3/5 handles them
--
-- On volume: `reactions` is included, and toggleLike writes on every tap, so
-- likes and unlikes each produce a row. audit_log is indexed on
-- (org_id, created_at) and on actor_profile_id. Flagged rather than excluded --
-- an audit trail with a carve-out for the chatty table is not an audit trail.

do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'cohort_members',
    'cohorts',
    'comments',
    'connected_accounts',
    'invitations',
    'live_stream_credentials',
    'live_streams',
    'meetup_attendance',
    'meetup_rsvps',
    'meetup_series',
    'meetups',
    'member_blocks',
    'member_reports',
    'member_stages',
    'memberships',
    'mentor_pairings',
    'orders',
    'org_profiles',
    'posts',
    'products',
    'reactions',
    'reports',
    'stage_transitions',
    'stages',
    'video_assets'
  ];
begin
  foreach v_table in array v_tables loop
    -- Fail loudly rather than silently skipping a typo'd or renamed table.
    if not exists (
      select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = v_table and c.relkind = 'r'
    ) then
      raise exception 'audit trigger target public.% does not exist', v_table;
    end if;

    execute format('drop trigger if exists %I on public.%I', v_table || '_audit', v_table);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function public.audit_row_change()',
      v_table || '_audit', v_table
    );
  end loop;
end;
$$;
