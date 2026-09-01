-- Reverse: restore the previous body of public.audit_row_change()
--          (supabase/migrations/20260902100307_audit_target_key_type_identifier.sql).
--
-- CD-3 and CD-4, deferred from audit PR 3/5 and owed before Wave 2 creates
-- `conversations` and `messages`. They share one cause and one fix.
--
-- CD-3 -- the DELETE branch decided whether to reference the organization by
-- SELECTing it first:
--
--   if tg_op = 'DELETE' and v_org_id is not null
--      and not exists (select 1 from public.organizations o where o.id = v_org_id)
--   then ... move the attribution into metadata ...
--
-- Under READ COMMITTED that answer is stale the instant it is returned: a
-- concurrent transaction can commit the organization's deletion between the
-- SELECT and the INSERT, and audit_log_org_id_fkey then aborts the write the
-- trigger exists to record. Deleting a member from an organization while the
-- organization itself is being deleted is enough.
--
-- CD-4 -- audit_log_actor_profile_id_fkey has the same shape, with no check at
-- all: request.jwt.claims carries a well-formed uuid `sub` for which no
-- profiles row exists, and every write by that caller aborts. Near-unreachable
-- through the app today, which is exactly why it would surface as an outage
-- rather than as a bug report.
--
-- THE FIX, and the principle it restores: do not check, then insert. The check
-- and the insert are two statements and the world changes between them. Insert,
-- and catch foreign_key_violation -- the only answer that cannot go stale is
-- the one the insert itself gives.
--
-- This is the same principle the file above already states for the actor and
-- the target id ("metadata must never abort the write it describes"), applied
-- to the two columns that still could.
--
-- CONSTRAINT_NAME rather than nulling both columns on any violation: deleting
-- an organization is a legitimate, routine path that lands here, and the actor
-- who did it is worth keeping. Nulling both would lose that attribution on
-- every organization deletion.
--
-- MEASURED, 2026-09-01, before writing this: an EXCEPTION block costs nothing
-- detectable on this path. 3000-row inserts carrying an incompressible 4 KB
-- body, alternating variants over three rounds -- without handler 170-208 ms,
-- with handler 180-200 ms. The subtransaction that the previous file's comment
-- warned about is real, but it is far below the cost of the audit INSERT it
-- wraps. The warning was against wrapping the whole function body per row; this
-- wraps one INSERT.
--
-- NOT DONE HERE, and deliberately: PERF-1, "build the row image only for
-- UPDATE". Its premise does not reproduce -- see the learned-constraint entry
-- added with this migration. to_jsonb(new) is not the cost it was recorded as.

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
  v_parent_id  uuid;
  v_actor      uuid;
  v_claims     text;
  v_target_raw text;
  v_target_id  uuid;
  v_id_type    text;
  v_constraint text;
begin
  if tg_table_name = 'audit_log' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  -- ---- actor: metadata must never abort the write it describes ----
  v_claims := nullif(current_setting('request.jwt.claims', true), '');
  if v_claims is not null and pg_input_is_valid(v_claims, 'json') then
    v_actor := public.audit_safe_uuid(v_claims::json ->> 'sub');
  end if;

  -- ---- target key ----
  v_target_raw := nullif(v_row ->> 'id', '');
  v_target_id  := public.audit_safe_uuid(v_target_raw);

  if v_target_raw is not null and v_target_id is null then
    -- typname, not format_type: an identifier, never prose with spaces in it.
    select t.typname into v_id_type
      from pg_attribute a
      join pg_type t on t.oid = a.atttypid
     where a.attrelid = tg_relid and a.attname = 'id'
       and a.attnum > 0 and not a.attisdropped;

    if v_id_type in ('int2', 'int4', 'int8') then
      -- Declared an integer surrogate key, so the value is an id, not content.
      v_meta := v_meta || jsonb_build_object('target_key', v_target_raw);
    else
      -- Any other type may be a user-chosen slug. Record that a key existed
      -- and what type it was; never the value.
      v_meta := v_meta || jsonb_build_object('target_key_type', coalesce(v_id_type, 'unknown'));
    end if;
  end if;

  -- ---- org resolution: same shape in every branch ----
  case v_mode
    when 'row' then
      v_org_id := public.audit_safe_uuid(v_row ->> 'org_id');
    when 'self' then
      v_org_id := v_target_id;
    when 'order' then
      v_parent_id := public.audit_safe_uuid(v_row ->> 'order_id');
      if v_parent_id is not null then
        select o.org_id into v_org_id from public.orders o where o.id = v_parent_id;
      end if;
    else
      raise exception
        'audit_row_change: unknown org resolution mode %, expected row, self or order', v_mode;
  end case;

  -- Column NAMES only, never values (invariants 3 and 4).
  --
  -- Do not interpolate v_row or v_before into any raise: they hold full row
  -- values including Family content, and a raise would put them in the
  -- Postgres log.
  if tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    select coalesce(array_agg(e.key order by e.key), '{}')
      into v_changed
      from jsonb_each(v_row) as e(key, value)
     where v_before -> e.key is distinct from e.value;
    v_meta := v_meta || jsonb_build_object('changed', to_jsonb(v_changed));
  end if;

  -- ---- the write, and the two references that can legitimately be gone ----
  --
  -- The organization is gone on its own deletion and on every cascade from it;
  -- the actor is gone if the claim names a profile that does not exist. Both
  -- are recorded in metadata, which has no foreign key and so cannot fail.
  begin
    insert into public.audit_log (
      actor_profile_id, org_id, action, target_type, target_id, metadata
    ) values (
      v_actor, v_org_id,
      tg_table_name || '.' || lower(tg_op), tg_table_name, v_target_id, v_meta
    );
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name;

    if v_constraint = 'audit_log_actor_profile_id_fkey' then
      -- The uuid is not recorded: it names no profile, so it is an unverified
      -- string from a claim rather than an id this database can vouch for.
      v_meta  := v_meta || jsonb_build_object('actor_unresolved', true);
      v_actor := null;
    else
      -- org_id_at_delete on a deletion, which is the routine case and the key
      -- this function has always written there. A violation on any other
      -- operation is a genuine concurrent deletion, and says so.
      v_meta := v_meta || jsonb_build_object(
        case when tg_op = 'DELETE' then 'org_id_at_delete' else 'org_id_unresolved' end,
        v_org_id);
      v_org_id := null;
    end if;

    begin
      insert into public.audit_log (
        actor_profile_id, org_id, action, target_type, target_id, metadata
      ) values (
        v_actor, v_org_id,
        tg_table_name || '.' || lower(tg_op), tg_table_name, v_target_id, v_meta
      );
    exception when foreign_key_violation then
      -- Both references were bad. Attribution is lost either way; the audit
      -- row is not. Bounded: nothing below has a foreign key.
      if v_org_id is not null then
        v_meta := v_meta || jsonb_build_object(
          case when tg_op = 'DELETE' then 'org_id_at_delete' else 'org_id_unresolved' end,
          v_org_id);
      end if;
      if v_actor is not null then
        v_meta := v_meta || jsonb_build_object('actor_unresolved', true);
      end if;
      insert into public.audit_log (
        actor_profile_id, org_id, action, target_type, target_id, metadata
      ) values (
        null, null,
        tg_table_name || '.' || lower(tg_op), tg_table_name, v_target_id, v_meta
      );
    end;
  end;

  return null;
end;
$$;

revoke execute on function public.audit_row_change() from public;
