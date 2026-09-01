-- Reverse: drop trigger ledger_events_audit on ledger_events, drop table
-- ledger_events, drop type ledger_event_type.

-- Schema session, PR 1 of 10. Ferenz 6.1.
--
-- THE DISTINCTION, STATED FIRST, because it is the one a later session is most
-- likely to collapse:
--
--   audit_log      Every mutation, enforced by trigger, metadata carrying
--                  column NAMES only and never values (invariants 3 and 5).
--                  A compliance record. Nobody reads it for pleasure.
--
--   ledger_events  What happened in this Family, in plain language, written
--                  deliberately by application code at moments that matter.
--                  It is what the Keepsake exports. A member reads it.
--
-- F6.1 says "explicitly separate from audit_log"; F3.4 has a Tower pivot
-- writing here "describing what happened in plain language". So this table
-- carries prose on purpose -- precisely what audit_log's metadata is forbidden
-- to carry. Two tables, two jobs. Merging them would either put Family content
-- into the compliance log or make the Family's own history unreadable.

create type ledger_event_type as enum (
  'table_entry',
  'brick_complete',
  'build_complete',
  'tower_event',
  'care_action',
  'vow_event'
);

create table ledger_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  event_type ledger_event_type not null,

  -- No default. An event with no content is a bug rather than a row, and a
  -- silent '{}' would produce a Ledger full of entries that say nothing --
  -- worse than a failed insert, because it looks like history.
  payload jsonb not null,

  created_at timestamptz not null default now()
);

-- No updated_at and no deleted_at, and both absences are the point.
--
-- The Ledger is the record. A record that can be quietly amended or removed is
-- not one, and this is the table the Keepsake exports and the Contribution
-- Report will eventually sit beside. Corrections are new events, the way a
-- ledger has always worked.

-- The only read this table has: one Family's timeline, newest first.
create index ledger_events_org_id_created_at_idx
  on ledger_events (org_id, created_at desc);

-- Invariant 5: the trigger ships in the migration that creates the table.
-- Yes, the Ledger is itself audited -- "every mutation writes to audit_log"
-- has no carve-out for tables that happen to look like logs. The audit row
-- records THAT an event was written; the prose stays here.
create trigger ledger_events_audit
  after insert or update or delete on ledger_events
  for each row execute function public.audit_row_change();
