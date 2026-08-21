-- Reverse: drop table blocks; drop table reports; drop type report_status;
-- drop type report_target_type.

-- Distinct from Session 6's organizer moderation: a report is a signal
-- routed to organizers (and, if escalated, platform_admin), not a removal
-- action by itself -- organizers decide what to do with it, often via
-- Session 6's moderate_post/moderate_comment. target_type covers a post,
-- a comment, or a person directly ("member-to-member reporting," per the
-- plan, is broader than reporting a single piece of content).
create type report_target_type as enum ('post', 'comment', 'member');
create type report_status as enum ('open', 'escalated', 'resolved');

-- target_id is deliberately not a foreign key -- it points at whichever
-- table target_type names (posts, comments, or profiles), and Postgres
-- foreign keys can't be conditional on another column's value. Same
-- polymorphic-reference shape as audit_log's target_type/target_id.
create table reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  reporter_profile_id uuid not null references profiles (id) on delete set null,
  target_type report_target_type not null,
  target_id uuid not null,
  reason text not null,
  status report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_profile_id uuid references profiles (id) on delete set null
);

create index reports_org_id_status_idx on reports (org_id, status);

-- Blocking is global, not per-org -- identity itself is global (Session 1:
-- "Identity is global, display is per-org"), and "I don't want to see
-- this person" is a personal safety boundary that should hold in every
-- community the two people might ever share, not just the one where the
-- block happened to originate.
create table blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_profile_id uuid not null references profiles (id) on delete cascade,
  blocked_profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_no_self_block check (blocker_profile_id <> blocked_profile_id)
);

create unique index blocks_unique_pair_idx on blocks (blocker_profile_id, blocked_profile_id);
create index blocks_blocked_profile_id_idx on blocks (blocked_profile_id);
