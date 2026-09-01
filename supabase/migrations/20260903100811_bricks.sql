-- Reverse: drop trigger bricks_audit on bricks, drop trigger
-- bricks_set_updated_at, drop table bricks, drop type brick_status, drop
-- constraint memberships_id_org_id_key on memberships.

-- Schema session, PR 4 of 10. Ferenz 4.2, and the lifecycle F4.4-F4.7 hang off.
--
-- A Brick is a unit of work under a Build: claimed by one member, verified by
-- another. Two of this table's rules are the product's actual safety
-- properties, and both are enforced here rather than in application code --
-- see verified_by and the composite keys below.

-- F4.2's five states, exactly. Modelled in the app as an XState machine; the
-- enum is the set of resting places that machine may leave a row in.
create type brick_status as enum (
  'open',
  'in_progress',
  'needs_help',
  'pending_verification',
  'done'
);

-- Needed so a Brick's assignee can be checked against the Brick's own Family
-- by the database rather than by whoever writes the next server action.
-- Additive: a unique index on a pair that is already unique by construction,
-- since id is the primary key. Nothing about memberships' behaviour changes.
alter table memberships add constraint memberships_id_org_id_key unique (id, org_id);

create table bricks (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references builds (id) on delete cascade,

  -- Denormalised for the same reason builds carries it: the Brick board reads
  -- per Family, and a policy that joined through build_id would evaluate that
  -- join per row. Kept honest by the composite key below.
  org_id uuid not null,

  -- Null until claimed (F4.2). Self-claim is F4.4, and concurrency is handled
  -- by the shape of the write rather than by a lock: `update bricks set
  -- assignee = me where id = $1 and assignee is null` is atomic under
  -- Postgres's row locking, so exactly one of two simultaneous claims affects
  -- a row and the loser sees zero rows updated. NOT yet asserted anywhere: the
  -- two-real-clients test is owed in schema PR 9, and pgTAP cannot write it
  -- (one session, and it runs as postgres). Until then this is a property of
  -- Postgres this column relies on, not a property this repo has measured.
  assignee uuid references memberships (id) on delete set null,

  -- F4.7: "any member OTHER THAN the Brick's assignee can confirm it". Written
  -- down as a column with a CHECK rather than left to the code path, because
  -- peer verification is the property that makes a completed Brick mean
  -- something -- and the Ledger accrues slices from completed Bricks.
  verified_by uuid references memberships (id) on delete set null,

  -- WHO verified, above, and THAT it was verified, here -- two facts, and only
  -- the second is permanent.
  --
  -- Modelling "was this verified" as `verified_by is not null` looked simpler
  -- and was wrong. `on delete set null` fires an UPDATE, an UPDATE
  -- re-evaluates CHECK constraints, so a done Brick whose verifier's
  -- membership was deleted violated the constraint and ABORTED THE DELETE.
  -- Measured: deleting an organization with one verified done Brick failed
  -- outright, and so a Family that had ever finished a Brick could not be
  -- deleted at all. CHECK constraints cannot be DEFERRABLE, so the fix is the
  -- data model, not the timing.
  --
  -- A verification is a historical event. The person can leave; the fact that
  -- somebody else signed the work off does not stop being true.
  verified_at timestamptz,

  description text not null check (length(btrim(description)) > 0),

  -- A hard deadline, not a range. F4.2 calls the field due_window; the name is
  -- deliberately not carried over, because a column called "window" holding a
  -- single instant misleads every future reader. F4.5 compares against it
  -- ("exceeds its due_window"), which is an instant comparison.
  -- Nullable: not every Brick has a date.
  due_at timestamptz,

  status brick_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A Brick cannot claim a Family its Build is not in.
  foreign key (build_id, org_id) references builds (id, org_id) on delete cascade,

  -- Its assignee and verifier must be members of that same Family. Without
  -- this, a Brick could be assigned to somebody in another Family: a real row,
  -- a valid id, and invisible to RLS, which sees nothing wrong with either
  -- side on its own.
  foreign key (assignee, org_id) references memberships (id, org_id) on delete set null,
  foreign key (verified_by, org_id) references memberships (id, org_id) on delete set null,

  -- F4.7, enforced: nobody signs off their own work.
  constraint bricks_verifier_is_not_assignee
    check (verified_by is null or assignee is null or verified_by <> assignee),

  -- A verifier always comes with a time. Enforced this direction only: at the
  -- moment of verification both are written, and later the pointer may clear
  -- on its own when the member leaves. The asymmetry is the whole fix.
  constraint bricks_verified_by_implies_verified_at
    check (verified_by is null or verified_at is not null),

  -- A Brick is only done once somebody else has confirmed it. This is what
  -- stops 'done' from being a status a claimant can simply assign themselves.
  -- On verified_at, not verified_by, so it survives the verifier leaving.
  constraint bricks_done_requires_verification
    check (status <> 'done' or verified_at is not null)
);

create trigger bricks_set_updated_at
  before update on bricks
  for each row execute function set_updated_at();

create index bricks_build_id_idx on bricks (build_id);
-- "Every open and claimed Brick in the Family, grouped by member" (D2).
create index bricks_org_id_status_idx on bricks (org_id, status);
-- "Their claimed Bricks with due windows" (D1), and F4.5's escalation sweep.
create index bricks_assignee_idx on bricks (assignee) where assignee is not null;
create index bricks_due_at_idx on bricks (due_at)
  where due_at is not null and status <> 'done';

create trigger bricks_audit
  after insert or update or delete on bricks
  for each row execute function public.audit_row_change();
