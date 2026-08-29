-- Reverse: drop function public.audit_safe_uuid(text);
--          restore the previous body of public.audit_row_change().
--
-- Two defects introduced by the previous fix in this same PR. Both found by a
-- second adversarial review, both reproduced. They share one cause: a
-- justification written into a comment and never tested.
--
-- N-1 -- metadata.target_key leaked user-controlled content.
--   create table _t_slug (id text primary key, ...);
--   insert ... values ('my-secret-family-name-and-a-private-note', ...);
--   -> target_key=my-secret-family-name-and-a-private-note
-- The previous comment claimed target_key was "an id, not content". That holds
-- for a bigserial and fails for a text primary key, which is routinely a
-- user-chosen slug. Invariants 3 and 4 both forbid it, and the whole metadata
-- design -- column NAMES, never values -- exists to make it impossible.
--
-- The decision now reads the id column's DECLARED TYPE rather than the value's
-- appearance. A regex like ^[0-9]+$ would still have stored a numeric natural
-- key such as a phone number; int2/int4/int8 is a surrogate key by
-- declaration. The catalog lookup runs only when the value is not a uuid, so
-- it costs nothing on every table that exists today.
--
-- N-2 -- the `order` mode guard did not short-circuit.
--   insert into _t_ord (order_id) values ('not-a-uuid');
--   ERROR: invalid input syntax for type uuid: "not-a-uuid"
-- It was written as `where pg_input_is_valid(...) and o.id = (...)::uuid`, and
-- AND in a WHERE clause does not guarantee evaluation order. The planner
-- evaluated the cast first. `row` mode was safe only because CASE *does*
-- guarantee ordering -- and relying on that distinction is how the unsafe form
-- gets copied next time.
--
-- So the validate-then-cast step becomes one function that cannot be written
-- wrongly, and all three modes use it identically.

create or replace function public.audit_safe_uuid(p_value text)
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  -- CASE guarantees ordered evaluation; a WHERE conjunct does not.
  select case
    when p_value is not null and p_value <> '' and pg_input_is_valid(p_value, 'uuid')
    then p_value::uuid
  end;
$$;

comment on function public.audit_safe_uuid(text) is
  'Returns the uuid p_value denotes, or null if it denotes none. Never raises. '
  'Use this instead of a bare ::uuid cast anywhere the input is not '
  'type-guaranteed -- a cast inside a WHERE conjunct is not protected by a '
  'guard beside it.';

revoke execute on function public.audit_safe_uuid(text) from public;

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
    select format_type(a.atttypid, null) into v_id_type
      from pg_attribute a
     where a.attrelid = tg_relid and a.attname = 'id'
       and a.attnum > 0 and not a.attisdropped;

    if v_id_type in ('smallint', 'integer', 'bigint') then
      -- Declared an integer surrogate key, so the value is an id.
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
