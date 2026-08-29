-- Reverse: restore the previous body of public.audit_row_change().
--
-- PR 3/5, part 4. Two defects that turned the audit trigger from a recorder
-- into a single point of failure for every write on all 30 audited tables.
-- Both found by adversarial QA review of PR #6, both reproduced.
--
-- CD-1: a non-uuid primary key broke every write on the table.
--   insert into _t_bigint (org_id) values (...);
--   ERROR: invalid input syntax for type uuid: "1"
--   CONTEXT: SQL statement "insert into public.audit_log (..."
-- audit_log.target_id is uuid, and the function cast NEW.id to it blindly.
-- This matters now rather than eventually: CLAUDE.md tells wave sessions to
-- attach this trigger to every new table, and bigserial is an ordinary choice
-- for a high-volume append table. The error names audit_log rather than the id
-- type, so it points diagnosis at the wrong place.
--
-- CD-2: a malformed request.jwt.claims broke every write, everywhere.
--   set local request.jwt.claims = 'not-json-at-all';
--   insert into cohorts ...;  ERROR: invalid input syntax for type json
-- auth.uid() casts that setting to json; its missing_ok flag guards an ABSENT
-- setting, not a malformed one. Verified the same statement succeeds with the
-- trigger disabled, so this was introduced here.
--
-- The principle both fixes share: the actor and the target id are metadata
-- ABOUT a write. Metadata must never be able to abort the write it describes.
-- Neither is silently dropped -- the real key moves into metadata.target_key,
-- and an unattributable actor is recorded as null, which is true.
--
-- pg_input_is_valid (Postgres 16+) rather than exception blocks: a plpgsql
-- EXCEPTION clause opens a subtransaction per row, and this function already
-- costs ~50% of write time on wide rows.

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row        jsonb;
  v_before     jsonb;
  v_changed    text[];
  v_meta       jsonb := '{}'::jsonb;
  v_mode       text  := coalesce(tg_argv[0], 'row');
  v_org_id     uuid;
  v_actor      uuid;
  v_claims     text;
  v_target_raw text;
  v_target_id  uuid;
begin
  if tg_table_name = 'audit_log' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  -- ---- actor: never let a bad claim abort the write (CD-2) ----
  v_claims := nullif(current_setting('request.jwt.claims', true), '');
  if v_claims is not null and pg_input_is_valid(v_claims, 'json') then
    v_actor := nullif(v_claims::json ->> 'sub', '');
  end if;

  -- ---- target: never let an unrepresentable key abort the write (CD-1) ----
  v_target_raw := nullif(v_row ->> 'id', '');
  if v_target_raw is not null then
    if pg_input_is_valid(v_target_raw, 'uuid') then
      v_target_id := v_target_raw::uuid;
    else
      v_meta := v_meta || jsonb_build_object('target_key', v_target_raw);
    end if;
  end if;

  -- ---- org resolution ----
  case v_mode
    when 'row' then
      v_org_id := case
        when pg_input_is_valid(coalesce(v_row ->> 'org_id', ''), 'uuid')
        then (v_row ->> 'org_id')::uuid
      end;
    when 'self' then
      v_org_id := v_target_id;  -- already validated above
    when 'order' then
      select o.org_id into v_org_id
        from public.orders o
       where pg_input_is_valid(coalesce(v_row ->> 'order_id', ''), 'uuid')
         and o.id = (v_row ->> 'order_id')::uuid;
    else
      raise exception
        'audit_row_change: unknown org resolution mode %, expected row, self or order', v_mode;
  end case;

  -- The org may already be gone: this row's own deletion, or a cascade from
  -- the org's. Referencing it would violate audit_log_org_id_fkey and roll the
  -- deletion back, so keep the attribution in metadata instead of the column.
  if tg_op = 'DELETE' and v_org_id is not null
     and not exists (select 1 from public.organizations o where o.id = v_org_id) then
    v_meta := v_meta || jsonb_build_object('org_id_at_delete', v_org_id);
    v_org_id := null;
  end if;

  -- Column NAMES only, never values (invariants 3 and 4).
  --
  -- Do not interpolate v_row or v_before into any raise: they hold full row
  -- values including Family content, and a raise puts them in the Postgres log.
  if tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    select coalesce(array_agg(e.key order by e.key), '{}')
      into v_changed
      from jsonb_each(v_row) as e(key, value)
     where v_before -> e.key is distinct from e.value;
    v_meta := v_meta || jsonb_build_object('changed', to_jsonb(v_changed));
  end if;

  insert into public.audit_log (
    actor_profile_id, org_id, action, target_type, target_id, metadata
  ) values (
    v_actor,
    v_org_id,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    v_target_id,
    v_meta
  );

  return null;
end;
$$;

revoke execute on function public.audit_row_change() from public;
