-- Reverse: drop trigger memberships_purge_member_blocks_and_reports; drop
-- function purge_member_blocks_and_reports_on_membership_delete; drop
-- trigger member_reports_membership_match_org; drop function
-- check_member_report_membership_match_org; drop table member_reports;
-- drop trigger member_blocks_membership_match_org; drop function
-- check_member_block_membership_match_org; drop table member_blocks.

-- F4milia's ask: a narrower, per-community complement to Session 7's
-- global reports/blocks -- NOT a replacement. blocks/reports stay exactly
-- as they are (20260824195729_reports_and_blocks.sql): a profile-scoped,
-- platform-wide "I never want to see this person again," with reports as
-- a permanent record that survives either party leaving. member_blocks/
-- member_reports answer a narrower question -- "not in this community" --
-- and are explicitly NOT permanent: unlike every other history table in
-- this schema (mentor_pairings, audit_log), these are tied to the
-- membership relationship itself, not the person, so when that
-- relationship ends the row has no reason left to exist. Boss's call.

-- blocker_membership_id/blocked_membership_id reference memberships(id),
-- not profiles(id) -- that's the entire point of "member"-scoped as
-- distinct from Session 7's profile-scoped blocks. The "on delete cascade"
-- here is real but rarely what actually fires: memberships is
-- soft-deleted in practice (deleted_at set, row kept -- see
-- docs/data-retention-policy.md's "historical records that must survive"
-- category), so the cleanup this feature actually needs -- "delete the
-- member_block/report when the membership is [soft-]deleted" -- is done
-- by the trigger below, not by this FK. The FK stays as a backstop for
-- the one path that does hard-delete a membership row: an org's own
-- deletion (organizations already cascades to memberships).
create table member_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  blocker_membership_id uuid not null references memberships (id) on delete cascade,
  blocked_membership_id uuid not null references memberships (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint member_blocks_no_self_block check (blocker_membership_id <> blocked_membership_id)
);

create unique index member_blocks_unique_pair_idx on member_blocks (blocker_membership_id, blocked_membership_id);
create index member_blocks_blocked_membership_id_idx on member_blocks (blocked_membership_id);

-- Same "both parties must actually belong to the org this row claims"
-- invariant Session 9 enforces for mentor_pairings
-- (check_mentor_pairing_roles_match_org) -- RLS's insert policy checks
-- this for the authenticated path, but this holds it as a real data
-- invariant regardless of caller, including service_role.
create or replace function check_member_block_membership_match_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from memberships
    where id = new.blocker_membership_id and org_id = new.org_id and deleted_at is null
  ) then
    raise exception 'blocker_membership_id must be an active membership in the same org';
  end if;

  if not exists (
    select 1 from memberships
    where id = new.blocked_membership_id and org_id = new.org_id and deleted_at is null
  ) then
    raise exception 'blocked_membership_id must be an active membership in the same org';
  end if;

  return new;
end;
$$;

create trigger member_blocks_membership_match_org
  before insert on member_blocks
  for each row execute function check_member_block_membership_match_org();

-- Deliberately not polymorphic like Session 7's reports (target_type
-- post/comment/member) -- this table exists specifically for the
-- member-to-member case, at the membership grain. Reporting a post or
-- comment stays on the original reports table; this one is additive.
create table member_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  reporter_membership_id uuid not null references memberships (id) on delete cascade,
  reported_membership_id uuid not null references memberships (id) on delete cascade,
  reason text not null,
  status report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_profile_id uuid references profiles (id) on delete set null,
  constraint member_reports_no_self_report check (reporter_membership_id <> reported_membership_id)
);

create index member_reports_org_id_status_idx on member_reports (org_id, status);

create or replace function check_member_report_membership_match_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from memberships
    where id = new.reporter_membership_id and org_id = new.org_id and deleted_at is null
  ) then
    raise exception 'reporter_membership_id must be an active membership in the same org';
  end if;

  if not exists (
    select 1 from memberships
    where id = new.reported_membership_id and org_id = new.org_id and deleted_at is null
  ) then
    raise exception 'reported_membership_id must be an active membership in the same org';
  end if;

  return new;
end;
$$;

create trigger member_reports_membership_match_org
  before insert on member_reports
  for each row execute function check_member_report_membership_match_org();

-- The actual "membership deleted -> member_block/report deleted" rule the
-- boss asked for. Fires on the soft-delete (deleted_at going from null to
-- set), not on a real DELETE, because that's the only kind of membership
-- deletion that happens in practice. SECURITY DEFINER is required, not
-- incidental: whoever soft-deletes a membership (an organizer removing
-- someone, or someone leaving on their own) has no RLS grant to delete
-- rows in member_blocks/member_reports they aren't a party to --
-- member_blocks in particular is deliberately as narrow as Session 7's
-- blocks ("only ever your own list," see the RLS migration), so without
-- SECURITY DEFINER this cleanup would fail with a permission error the
-- moment it tried to delete someone else's block row.
create or replace function purge_member_blocks_and_reports_on_membership_delete()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from member_blocks
      where blocker_membership_id = new.id or blocked_membership_id = new.id;
    delete from member_reports
      where reporter_membership_id = new.id or reported_membership_id = new.id;
  end if;
  return new;
end;
$$;

create trigger memberships_purge_member_blocks_and_reports
  after update on memberships
  for each row execute function purge_member_blocks_and_reports_on_membership_delete();
