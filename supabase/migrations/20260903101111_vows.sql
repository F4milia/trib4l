-- Reverse: drop function public.next_vow_holder(uuid); drop trigger vows_audit,
-- vows_set_updated_at on vows; drop table vows; drop type vow_status.

-- Schema session, PR 7. Ferenz 3.2/3.3, James 4.3. D1's element 6, "the current
-- Vow holder", reads this table directly.
--
-- SPEC 10.6 WAS OPEN: only the state machine is given. Settled as ONE ROTATING
-- VOW PER FAMILY, which is the spec's own reading of J4.3 ("whose turn it is,
-- the rotation order") -- a phrase that only means something if there is one
-- turn to be had at a time. D1's named edge case depends on it too: "Tower,
-- streak, Vow holder all switch with zero bleed" needs "the Vow holder" to be a
-- single unambiguous row per Family, not a list.
--
-- ROTATION ORDER IS DERIVED, NOT STORED, and that is the other decision here.
-- The obvious move was a `rotation_position` column on memberships. Rejected:
-- it needs maintaining on every join, departure and completion, and it can
-- drift from the history it is supposed to summarise. This table already IS the
-- history -- a completed Vow records who held it and when -- so "whose turn"
-- is a query over it. Same reasoning as the streak (derived, not counted).

-- F3.2's four states, exactly. Modelled in the app as an XState machine; the
-- enum is the set of resting places that machine may leave a row in.
create type vow_status as enum (
  'assigned',
  'active',
  'renegotiation_requested',
  'complete'
);

create table vows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,

  -- The membership, not the profile: the same person in two Families holds two
  -- unrelated Vows, and D1's edge case is precisely that those do not bleed.
  --
  -- `on delete cascade` for the same reason as table_entries: account deletion
  -- SOFT-deletes memberships (20260903100301 step 3), so a departed member's
  -- Vow history survives them. The only hard delete is the organizations
  -- cascade, where this row is going anyway.
  holder_id uuid not null,

  -- Free text. F3.2 gives the state machine and says nothing about what a Vow
  -- contains, and a structured shape here would be inventing product -- so it
  -- is a commitment in the Family's own words, which is what a vow is.
  commitment text not null check (length(btrim(commitment)) > 0),

  status vow_status not null default 'assigned',

  -- Why a Vow is being renegotiated, recorded when the transition happens.
  -- F3.3 makes renegotiation "visible to the whole Family", and a status change
  -- with no reason attached is visible without being legible.
  renegotiation_reason text,

  assigned_at timestamptz not null default now(),
  -- Set when status reaches 'complete'. The rotation query below orders by it,
  -- so it is the column that makes "nobody twice before everyone once" work.
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (holder_id, org_id) references memberships (id, org_id)
    on delete cascade,

  unique (id, org_id),

  -- A completed Vow has a completion time, and an uncompleted one does not.
  -- Enforced both directions because the rotation query treats a null
  -- completed_at as "still open" and would silently mis-order otherwise.
  constraint vows_complete_iff_completed_at
    check ((status = 'complete') = (completed_at is not null)),

  -- A reason belongs to a renegotiation. Not enforced in the other direction:
  -- the reason survives the transition out of renegotiation_requested, because
  -- the Family should still be able to see why it happened.
  constraint vows_reason_requires_renegotiation
    check (renegotiation_reason is null or status <> 'assigned')
);

-- ONE ROTATING VOW PER FAMILY, enforced rather than documented. Partial, so
-- completed Vows accumulate as history -- the same shape as
-- towers_one_active_per_org_idx.
create unique index vows_one_open_per_org_idx
  on vows (org_id) where status <> 'complete';

-- D1 reads the current holder per Family; the rotation query reads completions.
create index vows_org_status_idx on vows (org_id, status);
create index vows_holder_idx on vows (holder_id);
create index vows_org_completed_idx on vows (org_id, completed_at desc)
  where completed_at is not null;

create trigger vows_set_updated_at
  before update on vows
  for each row execute function set_updated_at();

create trigger vows_audit
  after insert or update or delete on vows
  for each row execute function public.audit_row_change();

/**
 * Whose turn it is: F2.2's rule, "stored so nobody is picked twice before
 * everyone has had a turn", applied to Vows per J4.3.
 *
 * Never held > held longest ago, with join order as the tiebreak so the answer
 * is deterministic for a brand-new Family where nobody has held anything.
 *
 * SECURITY INVOKER, deliberately. It reads memberships and vows, both of which
 * carry RLS, and invariant 5 says every new read path goes THROUGH policy
 * rather than around it with filtering on top. A definer function here would be
 * a hole that returns another Family's member list to anyone who guesses an
 * org_id -- exactly the shape of C1 PR4's unread-count defect.
 *
 * Mentors are excluded. Per spec 10.1 they do not consume a seat in the
 * twelve-member cap, so they are a distinct kind of participant; a Vow is a
 * commitment between the Family's members.
 */
create or replace function public.next_vow_holder(p_org_id uuid)
returns uuid
language sql
stable
as $$
  select m.id
    from public.memberships m
    left join (
      select holder_id, max(completed_at) as last_held
        from public.vows
       where org_id = p_org_id and completed_at is not null
       group by holder_id
    ) h on h.holder_id = m.id
   where m.org_id = p_org_id
     and m.deleted_at is null
     and m.role <> 'mentor'
   order by h.last_held asc nulls first, m.created_at asc, m.id asc
   limit 1;
$$;

comment on function public.next_vow_holder(uuid) is
  'The membership whose turn it is to hold the Family Vow: never held first, '
  'then held-longest-ago, then join order. SECURITY INVOKER so it reads through '
  'RLS. Returns null for a Family with no eligible members.';
