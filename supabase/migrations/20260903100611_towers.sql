-- Reverse: alter table organizations drop column active_tower_id, drop trigger
-- towers_audit on towers, drop trigger towers_set_updated_at, drop table
-- towers, drop type tower_status.

-- Schema session, PR 2 of 10. Ferenz 3.1.
--
-- The Tower is the Family's goal. F3.1 gives the columns and the four statuses;
-- J4.1 builds the definition flow on top, and J4.2 -- "the emotional peak of
-- the whole product" -- builds the completion ceremony.

create type tower_status as enum ('active', 'stalled', 'pivoted', 'complete');

create table towers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  description text,
  status tower_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Lets organizations.active_tower_id reference (id, org_id) as a pair, which
  -- is what makes "the pointer must aim inside the same Family" enforceable
  -- rather than merely intended. See the composite foreign key below.
  unique (id, org_id)
);

create trigger towers_set_updated_at
  before update on towers
  for each row execute function set_updated_at();

-- A Family works on one Tower at a time. F3.1 implies it by putting a single
-- active_tower_id on organizations; this makes it true rather than assumed, so
-- a second active Tower is a failed insert instead of a UI that renders two
-- goals and a support ticket.
create unique index towers_one_active_per_org_idx
  on towers (org_id) where status = 'active';

create index towers_org_id_idx on towers (org_id);

-- F3.1: "Add a nullable active_tower_id column to organizations."
--
-- The composite reference is the part worth reading. A plain FK to towers(id)
-- would happily let Family A point at Family B's Tower -- a cross-Family leak
-- that RLS could not catch, because the pointer itself would be legitimate.
-- Referencing (active_tower_id, id) against towers (id, org_id) means the
-- database refuses it.
alter table organizations
  add column active_tower_id uuid,
  add constraint organizations_active_tower_fk
    foreign key (active_tower_id, id) references towers (id, org_id)
    on delete set null;

comment on column organizations.active_tower_id is
  'The Tower this Family is currently building. Null between Towers -- a quiet season is a real state (F3.5), not a missing value.';

-- Invariant 5: the trigger ships in the migration that creates the table.
create trigger towers_audit
  after insert or update or delete on towers
  for each row execute function public.audit_row_change();
