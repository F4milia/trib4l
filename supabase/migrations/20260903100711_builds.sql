-- Reverse: drop trigger builds_audit on builds, drop trigger
-- builds_set_updated_at, drop table builds, drop type build_status, drop type
-- build_type.

-- Schema session, PR 3 of 10. Ferenz 4.1.
--
-- A Build is a workstream under a Tower. F4.1 gives id, tower_id, type and
-- status; the four types are its list exactly.

create type build_type as enum ('commerce', 'permanence', 'propagation', 'custom');

-- F4.1 names `status` without enumerating it. F4.8's cascade is the only
-- constraint on it -- "all Bricks done closes the Build" -- so a Build is open
-- until its Bricks finish it. Two states carry that; inventing a third
-- (paused, blocked) would be inventing product. Flagged in the PR description.
create type build_status as enum ('open', 'complete');

create table builds (
  id uuid primary key default gen_random_uuid(),
  tower_id uuid not null references towers (id) on delete cascade,

  -- Denormalised from towers, deliberately. Every RLS policy on this table and
  -- on bricks needs the Family, and reaching it through tower_id would make
  -- each policy a join evaluated per row -- on the hot path for the Brick
  -- board. It also lets the audit trigger resolve org_id in its default 'row'
  -- mode rather than needing a new resolution mode taught to a SECURITY
  -- DEFINER function. Kept honest by the composite key below.
  org_id uuid not null,

  type build_type not null,
  status build_status not null default 'open',
  title text not null check (length(btrim(title)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The same device towers uses for active_tower_id. Denormalising org_id is
  -- only safe if it cannot disagree with the Tower's: this pair must exist
  -- together in towers, so a Build cannot claim a Family its Tower is not in.
  foreign key (tower_id, org_id) references towers (id, org_id) on delete cascade,

  -- So bricks can carry the same guarantee one level down.
  unique (id, org_id)
);

create trigger builds_set_updated_at
  before update on builds
  for each row execute function set_updated_at();

create index builds_tower_id_idx on builds (tower_id);
create index builds_org_id_open_idx on builds (org_id) where status = 'open';

create trigger builds_audit
  after insert or update or delete on builds
  for each row execute function public.audit_row_change();
