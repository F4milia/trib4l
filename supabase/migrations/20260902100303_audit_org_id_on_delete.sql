-- Reverse: restore the previous body of public.audit_row_change().
--
-- PR 3/5, part 3. Fixes a bug that made deleting an organization impossible.
--
-- audit_log.org_id carries a foreign key to organizations(id). On an
-- organizations DELETE the AFTER trigger ran with the row already gone, so
-- writing OLD.id into org_id violated that key and rolled the deletion back.
-- Raised by CodeRabbit on PR #6 for the `self` mode.
--
-- It is broader than `self`. Deleting an organization cascades to its children,
-- and each child's AFTER DELETE trigger writes OLD.org_id in the default `row`
-- mode -- pointing at the same, already-deleted org. Reproduced both:
--
--   delete from organizations where id = X;
--     ERROR: audit_log_org_id_fkey ... Key (org_id)=(X) is not present
--   -- and identically with a cohorts row hanging off it
--
-- So the guard is generic: on DELETE, if the resolved org no longer exists,
-- null the column. The attribution is not thrown away -- it moves into
-- metadata as org_id_at_delete, which is an id, not content, and so stays
-- inside the rule that metadata carries no free text.

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
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
      v_org_id := nullif(v_row ->> 'org_id', '')::uuid;
    when 'self' then
      v_org_id := nullif(v_row ->> 'id', '')::uuid;
    when 'order' then
      select o.org_id into v_org_id
        from public.orders o
       where o.id = nullif(v_row ->> 'order_id', '')::uuid;
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

revoke execute on function public.audit_row_change() from public;
