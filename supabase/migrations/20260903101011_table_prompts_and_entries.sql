-- Reverse: drop trigger table_entries_audit, table_entries_prompt_matches_org,
-- table_entries_set_updated_at on table_entries; drop table table_entries; drop
-- trigger table_prompts_audit, table_prompts_set_updated_at on table_prompts;
-- drop table table_prompts; drop trigger mood_tags_audit,
-- mood_tags_set_updated_at on mood_tags; drop table mood_tags; drop function
-- public.check_table_entry_prompt_matches_org().

-- Schema session, PR 6. Ferenz 1.1, and the Table is the product's daily habit.
--
-- THE DECISION THAT SHAPED THIS FILE: a Table entry is its OWN row, not a
-- `posts` row. `posts` already exists, inherited from Trib4l, and even carries a
-- search_vector -- but it is cohort/stage/video shaped, gated by
-- can_see_gated_content(org_id, cohort_id, required_stage_id), and has no
-- prompt, no date and no mood. Adding three F4milia columns to it would drag
-- three Trib4l foreign keys into the Table. The cost is accepted knowingly:
-- F1's keyword search and F3's results UI will read two content tables.
--
-- TWO OPEN SPEC QUESTIONS ARE DEFERRED AS DATA RATHER THAN GUESSED, because
-- inventing either would be inventing product:
--
--   10.5  mood_tag's permitted set is unspecified. So `mood_tags` ships EMPTY.
--         The column exists and the vocabulary does not, which is the honest
--         state -- and filling it later is an INSERT, not a migration.
--   10.4  Nothing says whether prompts are platform-authored, Family-authored,
--         seasonal or rotating. So `table_prompts.org_id` is NULLABLE: null
--         means platform-authored, set means this Family wrote it. Both models
--         fit, and choosing between them later costs no schema change.

-- ------------------------------------------------------------------ mood_tags
-- Deliberately unseeded. See 10.5 above. A row here is a product decision.
create table mood_tags (
  id uuid primary key default gen_random_uuid(),
  -- Same nullable-org convention as table_prompts: null is a platform-wide tag.
  org_id uuid references organizations (id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  -- Sort position rather than alphabetical: a mood scale has an order that its
  -- labels do not.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);

create index mood_tags_org_id_idx on mood_tags (org_id);

create trigger mood_tags_set_updated_at
  before update on mood_tags
  for each row execute function set_updated_at();

create trigger mood_tags_audit
  after insert or update or delete on mood_tags
  for each row execute function public.audit_row_change();

-- -------------------------------------------------------------- table_prompts
create table table_prompts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  -- A prompt is retired, never deleted: entries reference it, and F1.2 creates
  -- the daily opportunity from the active set.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);

create index table_prompts_active_idx on table_prompts (org_id, active) where active;

create trigger table_prompts_set_updated_at
  before update on table_prompts
  for each row execute function set_updated_at();

create trigger table_prompts_audit
  after insert or update or delete on table_prompts
  for each row execute function public.audit_row_change();

-- -------------------------------------------------------------- table_entries
create table table_entries (
  id uuid primary key default gen_random_uuid(),

  -- Denormalised for policy cost, as on builds and bricks, and kept honest by
  -- the composite key below.
  org_id uuid not null,

  -- The membership, not the profile. F1.1 says `member_id -> memberships`, and
  -- it matters: the same person in two Families writes two unrelated entries,
  -- and the Ledger accrues per membership.
  --
  -- `on delete cascade` is safe here specifically because account deletion does
  -- NOT hard-delete memberships -- 20260903100301 step 3 soft-deletes them, so
  -- role history survives. The only hard delete is the organizations cascade,
  -- where the entries are going anyway. This is what lets a departed or
  -- memorialised member's entries persist (invariant 8, spec 2.9) while still
  -- letting a Family be deleted whole.
  member_id uuid not null,

  -- `entry_date`, not `date`. F1.1 names the field `date`; a column called
  -- `date` shadows the type name in every function body that touches it. Same
  -- kind of deliberate departure as bricks.due_at.
  --
  -- A date, not a timestamptz: F1.2 creates the opportunity once per day per
  -- Family "respecting each Family's IANA timezone", so the day is resolved
  -- against organizations.timezone at write time. Storing an instant would make
  -- "today" ambiguous for exactly the Families the timezone rule exists for.
  entry_date date not null,

  -- Nullable, and `set null` rather than cascade: an entry outlives the prompt
  -- that occasioned it. Losing the prompt must never lose the response.
  prompt_id uuid references table_prompts (id) on delete set null,

  response_text text not null check (length(btrim(response_text)) > 0),

  -- Optional per F1.1.
  mood_tag_id uuid references mood_tags (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete, matching posts, messages and conversations. M1's edge case
  -- ("delete an entry carrying a photo -- the storage object is unreachable
  -- afterward") reads an entry as deletable; memorial-lock content reads it as
  -- permanent. Soft delete is what satisfies both.
  deleted_at timestamptz,

  -- An entry cannot claim a Family its author is not in. Without this, an entry
  -- could be attributed to somebody in another Family: real ids, and invisible
  -- to RLS, which sees nothing wrong with either side alone.
  foreign key (member_id, org_id) references memberships (id, org_id)
    on delete cascade,

  -- For the composite keys that M1's photos and this PR's sibling Hurt/Repair
  -- flags will need. Additive: id is already the primary key.
  unique (id, org_id)
);

-- ONE ENTRY PER MEMBER PER DAY (F1.2: the opportunity is created once per day
-- per Family for every active member). Partial, so a soft-deleted entry does
-- not block writing that day again -- otherwise deleting an entry would cost
-- the member the day permanently.
create unique index table_entries_one_per_member_per_day_idx
  on table_entries (member_id, entry_date) where deleted_at is null;

-- "Today's Table prompt status" (D1) and the streak, which reads a Family's
-- entry dates in order.
create index table_entries_org_date_idx on table_entries (org_id, entry_date desc)
  where deleted_at is null;
create index table_entries_member_idx on table_entries (member_id, entry_date desc)
  where deleted_at is null;
create index table_entries_prompt_idx on table_entries (prompt_id)
  where prompt_id is not null;
create index table_entries_mood_tag_idx on table_entries (mood_tag_id)
  where mood_tag_id is not null;

-- A composite FK cannot express this, and that is why it is a trigger. The rule
-- is "the prompt is this Family's OR it is platform-wide", and a composite key
-- on (prompt_id, org_id) would fail the platform case outright: MATCH SIMPLE
-- skips the check entirely when any referenced column is null, so a null
-- org_id would let an entry point at ANY Family's prompt. Same shape as this
-- repo's existing check_post_cohort_matches_org().
create or replace function public.check_table_entry_prompt_matches_org()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_prompt_org uuid;
  v_found boolean;
begin
  if new.prompt_id is null then
    return new;
  end if;

  select p.org_id, true into v_prompt_org, v_found
    from public.table_prompts p where p.id = new.prompt_id;

  -- The plain FK on prompt_id already refuses a missing prompt; this branch
  -- exists so the function does not silently pass on a NULL from no rows.
  if not coalesce(v_found, false) then
    raise exception 'table_entries.prompt_id % does not exist', new.prompt_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_prompt_org is not null and v_prompt_org <> new.org_id then
    raise exception 'table_entries.prompt_id % belongs to another Family', new.prompt_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_table_entry_prompt_matches_org() from public;

create trigger table_entries_prompt_matches_org
  before insert or update of prompt_id, org_id on table_entries
  for each row execute function public.check_table_entry_prompt_matches_org();

create trigger table_entries_set_updated_at
  before update on table_entries
  for each row execute function set_updated_at();

create trigger table_entries_audit
  after insert or update or delete on table_entries
  for each row execute function public.audit_row_change();
