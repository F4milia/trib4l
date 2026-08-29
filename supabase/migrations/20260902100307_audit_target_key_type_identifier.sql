-- Reverse: restore the previous body of public.audit_row_change().
--
-- Q3-1. The content guard fired on its own output.
--
-- The previous fix recorded a non-uuid key's type with format_type(), which
-- returns human-readable names. Several contain spaces:
--
--   varchar     -> "character varying"
--   timestamptz -> "timestamp with time zone"
--
-- The property test asserts that no metadata value anywhere contains
-- whitespace, so a varchar primary key made that assertion fail on data the
-- assertion's own subject had produced -- reporting a content leak where there
-- was none. Not a leak (a type name is not user data), but worse than
-- harmless: a guard that cries wolf is a guard people learn to route around,
-- which is already a recorded learned constraint here.
--
-- pg_type.typname is the whitespace-free identifier: varchar, timestamptz,
-- int8, _text.
--
-- COUPLED CHANGE, and the reason TC-B exists: typname yields int2/int4/int8,
-- NOT smallint/integer/bigint. Changing the lookup without changing the
-- comparison would silently stop preserving integer surrogate keys -- the
-- exact case the previous fix was written to keep. The two lines move
-- together, and 050 asserts all three widths.

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
