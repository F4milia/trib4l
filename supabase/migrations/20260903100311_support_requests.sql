-- Reverse: drop trigger support_requests_audit on support_requests, drop
-- trigger support_requests_set_updated_at, drop table support_requests, drop
-- type support_request_status.

-- Wave 7 / H1, PR 1 of 4, pulled forward. The run doc: "Help page: FAQ plus a
-- contact form routing to platform_staff, written to the audit log like every
-- mutation." Acceptance: "a submitted form reaches the staff view and writes an
-- audit row."
--
-- docs/v1-repo-audit.md found the staff half missing and re-cut it into this
-- session rather than opening another: "No staff view exists -- app/admin holds
-- one provisioning page... Cheapest correct slot: re-cut H1's own scope to
-- include the minimal staff inbox it needs."
--
-- THE ONE DESIGN DECISION WORTH READING: org_id is nullable.
--
-- H1's named edge case is "a user in no Family submits the form." Somebody who
-- has signed up and not yet joined or created a Family is precisely the person
-- most likely to need help, and they are the one person a NOT NULL org_id
-- would lock out of the only support channel they have. So this table joins
-- profiles and blocks as a genuinely org-less-capable row: the audit trigger
-- records a null Family rather than inventing one.

create type support_request_status as enum ('open', 'handled');

create table support_requests (
  id uuid primary key default gen_random_uuid(),

  -- on delete set null, not cascade. A support request is a record of a staff
  -- interaction: it outlives the account that sent it, the same way reports
  -- and orders do. In practice the FK rarely fires at all -- account deletion
  -- here is a soft delete (docs/data-retention-policy.md), so the row stays
  -- attributed to the anonymized profile id, exactly as audit_log does.
  submitted_by_profile_id uuid references profiles (id) on delete set null,

  -- Which Family the request is ABOUT, when there is one. Null is a first-class
  -- value here, not a missing one -- see the note above.
  org_id uuid references organizations (id) on delete set null,

  -- A contact form that accepts an empty message is a ticket queue nobody can
  -- action. Checked in the database rather than only in the form, because the
  -- form is not the only thing that can insert.
  subject text not null check (length(btrim(subject)) > 0),
  body text not null check (length(btrim(body)) > 0),

  -- Closed set. 'escalated', 'spam' and friends are states somebody will want
  -- eventually; adding an enum value then is a one-line migration, and is
  -- better than a free-text status nobody can filter on reliably.
  status support_request_status not null default 'open',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No deleted_at: status carries the whole lifecycle, same reasoning as
-- invitations. And it has to be a real absence of a delete path -- there is no
-- DELETE grant in the RLS migration either.

create trigger support_requests_set_updated_at
  before update on support_requests
  for each row execute function set_updated_at();

-- The staff inbox reads "everything still open, newest first". Partial index
-- so it stays small as handled requests accumulate.
create index support_requests_open_idx
  on support_requests (created_at desc) where status = 'open';

create index support_requests_submitted_by_idx
  on support_requests (submitted_by_profile_id);

-- Invariant 5: the trigger ships in the migration that creates the table.
-- Default 'row' mode -- the table carries org_id, and a null there is correct
-- for a request from someone in no Family.
create trigger support_requests_audit
  after insert or update or delete on support_requests
  for each row execute function public.audit_row_change();
