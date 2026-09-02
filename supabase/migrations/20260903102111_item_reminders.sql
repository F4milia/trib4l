-- Reverse: drop trigger item_reminders_audit on item_reminders; drop table
-- item_reminders; drop type reminder_target. The bricks constraint below is
-- shared with care_actions and is not dropped here.

-- D2's "reminder toggles per item", and PR 2 of the master plan.
--
-- WHY NEITHER EXISTING TABLE CAN HOLD THIS. Re-checked against main after C2
-- landed, because C2 added a second notification table and the answer was not
-- obvious:
--
--   notification_preferences  (org_id, profile_id, notification_type, channel,
--                              enabled)
--     A per-TYPE switch. "Mute Vow events in this Family." There is no item
--     dimension and adding one would change what every existing row means.
--
--   notifications             (org_id, membership_id, type, target_type,
--                              target_id, actor_membership_id, read_at)
--     The DELIVERED record -- what happened, and whether it was read. A
--     reminder that has not fired yet is not a notification.
--
-- What D2 needs is neither: a SUBSCRIPTION. "Remind me about this particular
-- Brick." It is created by a member toggling a switch on one row of the
-- calendar, and N1 reads it later to decide what to send.

-- `bricks` needs unique (id, org_id) before anything can reference it
-- Family-safely. towers, builds and table_entries all carry that pair; bricks
-- was given one on memberships (20260903100811 line 26) and never one on
-- itself.
--
-- GUARDED, so merge order does not matter. care_actions (20260903102011) needs
-- the same constraint and was written in parallel off the same main. A bare
-- `alter table ... add constraint` in both would mean whichever merged second
-- failed on a duplicate name -- which is a stacking dependency reintroduced
-- through the schema rather than through git. Both add it idempotently instead,
-- so either can merge first.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bricks_id_org_id_key') then
    alter table public.bricks add constraint bricks_id_org_id_key unique (id, org_id);
  end if;
end
$$;

-- D2's calendar shows three things: Family Night, Vow rotation turns, and
-- Brick due windows. Those are the three a reminder can be attached to.
--
-- `family_night` has no row of its own -- it is a schedule on the Family, so
-- both id columns stay null for it. The CHECK below makes that explicit rather
-- than leaving "both null" as a convention somebody has to know.
create type reminder_target as enum (
  'brick',
  'vow',
  'family_night'
);

create table item_reminders (
  id uuid primary key default gen_random_uuid(),

  -- Denormalised for policy cost, kept honest by the composite key below.
  org_id uuid not null,

  -- WHOSE reminder. A membership, not a profile: the same person in two
  -- Families sets reminders separately in each, which is the same reasoning
  -- E1's per-Family preferences rest on.
  membership_id uuid not null,

  target reminder_target not null,

  -- TYPED COLUMNS, not a bare (target_type, target_id) pair -- the same
  -- decision as care_actions and for the same reason: a polymorphic uuid
  -- cannot carry a foreign key, so nothing would stop a reminder naming a row
  -- in another Family. Each typed column takes a COMPOSITE key to this Family.
  target_brick_id uuid,
  target_vow_id uuid,

  created_at timestamptz not null default now(),

  foreign key (membership_id, org_id) references memberships (id, org_id)
    on delete cascade,

  -- DEFERRABLE for the reason 20260903100811 documents: deleting an
  -- organization reaches memberships AND, through towers and builds, bricks,
  -- in no promised order.
  foreign key (target_brick_id, org_id) references bricks (id, org_id)
    on delete cascade deferrable initially deferred,

  foreign key (target_vow_id, org_id) references vows (id, org_id)
    on delete cascade,

  -- The id column has to match the target kind, and family_night has neither.
  -- Without this the enum and the columns could disagree, and a reminder would
  -- claim to be about a Brick while pointing at a Vow.
  constraint item_reminders_target_matches_kind
    check (
      (target = 'brick'        and target_brick_id is not null and target_vow_id is null)
      or (target = 'vow'       and target_vow_id is not null and target_brick_id is null)
      or (target = 'family_night' and target_brick_id is null and target_vow_id is null)
    )
);

-- ONE TOGGLE PER ITEM PER MEMBER. A switch that can be flipped on twice is not
-- a switch. Three partial indexes rather than one on the nullable columns:
-- NULLs are distinct in a unique index, so a single index over
-- (membership_id, target, target_brick_id, target_vow_id) would let a member
-- subscribe to Family Night unboundedly many times.
create unique index item_reminders_one_per_brick_idx
  on item_reminders (membership_id, target_brick_id)
  where target_brick_id is not null;
create unique index item_reminders_one_per_vow_idx
  on item_reminders (membership_id, target_vow_id)
  where target_vow_id is not null;
create unique index item_reminders_one_family_night_idx
  on item_reminders (membership_id)
  where target = 'family_night';

-- N1 sweeps these to decide what to send; D2 reads a member's own toggles to
-- render the calendar.
create index item_reminders_org_target_idx on item_reminders (org_id, target);
create index item_reminders_membership_idx on item_reminders (membership_id);

create trigger item_reminders_audit
  after insert or update or delete on item_reminders
  for each row execute function public.audit_row_change();

-- NO `enabled` COLUMN, unlike notification_preferences, and the difference is
-- deliberate. A per-TYPE preference needs three states -- on, off, and never
-- set -- because a default has to apply to the unset case. A per-ITEM reminder
-- has two: the row exists or it does not. Adding `enabled` here would create a
-- second way to mean "off" and a fourth state nobody has defined.
comment on table item_reminders is
  'D2 per-item reminder toggles. A SUBSCRIPTION, distinct from '
  'notification_preferences (per-type switch) and notifications (delivered '
  'record). Row present means remind me; there is no enabled column.';
