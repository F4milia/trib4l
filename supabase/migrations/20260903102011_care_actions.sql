-- Reverse: drop trigger care_actions_audit on care_actions; drop table
-- care_actions; drop type care_action_type; drop constraint
-- bricks_id_org_id_key on bricks.

-- Ferenz 5.1. The thing a Family does when somebody is struggling.
--
-- WHY IT IS NEEDED NOW, a wave ahead of the session that displays it: F4.6 is
-- the coupling. "Need help" converts a Brick to an open, claimable task AND
-- CREATES A LINKED CARE ACTION -- so the moment the Brick lifecycle exists,
-- this table is on its write path. D2 shows them on the board in Wave 3 and
-- N1's inbox lists them in Wave 4, and neither can be built against a table
-- that does not exist. See docs/f4milia/stream-b-master-plan.md.

-- Needed so a Care Action aimed at a Brick can be checked against that Brick's
-- own Family by the database rather than by whoever writes the next server
-- action.
--
-- `towers`, `builds` and `table_entries` all carry this pair; `bricks` was
-- given one on `memberships` (20260903100811 line 26) and never one on itself,
-- so it is the one table in the chain that cannot yet be referenced
-- Family-safely. Found by this migration failing with "there is no unique
-- constraint matching given keys for referenced table bricks".
--
-- Additive: a unique index on a pair that is already unique by construction,
-- since id is the primary key. Nothing about bricks' behaviour changes.
alter table bricks add constraint bricks_id_org_id_key unique (id, org_id);

-- F5.1's three, exactly. Not a lifecycle -- see the note on status below.
create type care_action_type as enum (
  'cover_task',
  'offer_bandwidth',
  'reminder'
);

create table care_actions (
  id uuid primary key default gen_random_uuid(),

  -- Denormalised for policy cost, as on builds, bricks and table_entries, and
  -- kept honest by the composite keys below.
  org_id uuid not null,

  type care_action_type not null,

  -- Who is offering. A membership, not a profile: the same person in two
  -- Families offers help twice over, and the Ledger reads per membership.
  --
  -- `on delete cascade` is safe for the same reason it is on table_entries:
  -- account deletion SOFT-deletes memberships (20260903100301 step 3), so a
  -- departed member's offers survive them. The only hard delete is the
  -- organizations cascade, where this row is going anyway.
  from_membership_id uuid not null,

  -- F5.1: the target is "a membership_id OR a brick_id".
  --
  -- TWO NULLABLE COLUMNS WITH A CHECK, not a (target_type, target_id) pair.
  -- The pair is the shape C2's notifications table uses, and it cannot carry a
  -- foreign key -- a polymorphic id is just a uuid, so nothing stops it
  -- naming a row in another Family. Two typed columns each get a COMPOSITE key
  -- to this Family, which is the only thing that makes cross-Family targeting
  -- impossible rather than merely unlikely. The cost is one CHECK; the benefit
  -- is that RLS never has to be the last line of defence here.
  target_membership_id uuid,
  target_brick_id uuid,

  created_at timestamptz not null default now(),

  -- The offerer must be in the Family the action belongs to.
  foreign key (from_membership_id, org_id) references memberships (id, org_id)
    on delete cascade,

  -- ...and so must the person being helped.
  foreign key (target_membership_id, org_id) references memberships (id, org_id)
    on delete set null (target_membership_id),

  -- ...and the Brick, which is the F4.6 path.
  --
  -- DEFERRABLE for the reason 20260903100811 documents on bricks itself:
  -- deleting an organization cascades to memberships AND, through towers and
  -- builds, to bricks, in no promised order. An immediate check can see a
  -- half-torn-down Family and abort the whole delete.
  foreign key (target_brick_id, org_id) references bricks (id, org_id)
    on delete cascade deferrable initially deferred,

  -- Exactly one target. An action aimed at nothing is not an offer, and one
  -- aimed at both is two offers wearing one row.
  constraint care_actions_exactly_one_target
    check ((target_membership_id is null) <> (target_brick_id is null)),

  -- Nobody offers to cover their own task. Not decoration: F5.1 describes an
  -- act between people, and a self-addressed Care Action would show up in the
  -- Family's feed of who is helping whom as noise.
  constraint care_actions_not_self_addressed
    check (target_membership_id is null or target_membership_id <> from_membership_id),

  unique (id, org_id)
);

-- "Care Actions" in N1's inbox, and D2's board, both read per Family.
create index care_actions_org_created_idx on care_actions (org_id, created_at desc);
create index care_actions_from_idx on care_actions (from_membership_id);
create index care_actions_target_membership_idx on care_actions (target_membership_id)
  where target_membership_id is not null;
-- F4.6's path: "what help has been offered on this Brick".
create index care_actions_target_brick_idx on care_actions (target_brick_id)
  where target_brick_id is not null;

create trigger care_actions_audit
  after insert or update or delete on care_actions
  for each row execute function public.audit_row_change();

-- NO STATUS COLUMN, and that is deliberate rather than unfinished.
--
-- F5.1 gives the fields and the three types and no lifecycle: nothing in the
-- source says a Care Action is accepted, declined, or completed. Inventing
-- `status` here would invent product, and it would invent it in the schema --
-- the hardest place to take it back out. F5.2 says "in-app delivery first",
-- and delivery state is what C2's `notifications` table already models.
--
-- If a lifecycle is specified later it is an enum and a column, additively.
comment on table care_actions is
  'Ferenz 5.1. An offer of help, from one membership to either another '
  'membership or a Brick. Exactly one target, enforced. No lifecycle: F5.1 '
  'specifies none, and delivery state belongs to notifications.';
