-- Reverse: drop trigger memberships_reset_notification_preferences_on_removal
-- and memberships_reset_notification_preferences_on_soft_removal on
-- memberships, drop function reset_notification_preferences_on_membership_end,
-- drop function notification_preference_enabled, drop trigger
-- notification_preferences_audit, drop table notification_preferences, drop
-- type notification_channel, drop type notification_type.

-- Wave 1 / E1, PR 2 of 5. Ferenz 12.3, which docs/v1-repo-audit.md marks
-- missing and flags as the item "James's 13.1 and the run doc's N1 both
-- consume". The wave table's note on E1 is "E1 gates all notification work" --
-- this table is the gate.
--
-- CLAUDE.md invariant 3: "Notification preferences are per-Family, never one
-- global mute." That is the whole reason org_id is part of the key rather than
-- this being a column on profiles.

-- Two values, because E1 sends exactly two things a member can reasonably
-- decline. Deliberately NOT here:
--   family invite   -- the recipient is not a member yet, so there is no
--                      per-Family preference to consult, and nobody can mute
--                      an invitation they have not received
--   password reset  -- account security, never optional
-- N1 (Wave 4) extends this enum with mention/direct_message/care_action/
-- brick_nudge/table_prompt. Enum values for features that have no schema yet
-- would be invented placeholders, which CLAUDE.md rules out; adding a value is
-- a one-line migration.
create type notification_type as enum (
  'family_night_digest',
  'vow_notification'
);

-- One value today. The dimension exists now so that N1 adds an enum value
-- rather than adding a column to a populated table and rebuilding the unique
-- key -- N1's own acceptance criterion is "a muted type does not deliver --
-- in-app or push", which needs this axis to exist.
create type notification_channel as enum ('email');

-- ABSENCE OF A ROW IS THE DEFAULT, AND THE DEFAULT IS SUBSCRIBED.
-- A row exists only where a member has expressed a choice. The alternative --
-- seeding a row per (member x type x channel) when someone joins -- makes
-- every new notification type a backfill, and makes E1's named edge case
-- ("re-invite later; defaults are fresh") a backfill too. Here the edge case
-- is a delete.
create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  notification_type notification_type not null,
  channel notification_channel not null default 'email',
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, profile_id, notification_type, channel)
);

-- No deleted_at, same reasoning as invitations: this is a setting, not user
-- content, and the soft-delete policy is about content. It also has to be a
-- real delete -- the removal trigger below only means anything if the rows go.
create trigger notification_preferences_set_updated_at
  before update on notification_preferences
  for each row execute function set_updated_at();

-- The unique constraint's index already serves (org_id, profile_id, ...)
-- lookups and the removal trigger. This one serves "every preference I hold,
-- across all my Families" -- the shape 17.1's settings UI reads.
create index notification_preferences_profile_id_idx
  on notification_preferences (profile_id);

-- Invariant 5: the trigger ships in the migration that creates the table.
-- 'row' mode -- the table carries org_id.
create trigger notification_preferences_audit
  after insert or update or delete on notification_preferences
  for each row execute function public.audit_row_change();

-- The one place the absence-is-default rule is written down. Application code
-- reads preferences through this rather than reimplementing "no row means
-- yes" in each sender, where getting it backwards fails silently by NOT
-- sending -- the failure mode nobody notices.
--
-- SECURITY DEFINER because the send path has no user session: a Family Night
-- digest is a scheduled job, not something a member triggers about themselves.
-- Narrow by construction -- it answers one boolean about one (member, Family,
-- type, channel) and cannot enumerate. That is why service_role gets EXECUTE
-- on this and no privilege at all on the table.
create or replace function public.notification_preference_enabled(
  p_org_id uuid,
  p_profile_id uuid,
  p_type notification_type,
  p_channel notification_channel default 'email'
)
returns boolean
language sql
security definer
stable
-- pg_temp explicit and last, per the 2026-08-28 learned constraint: an empty
-- pin leaves it implicitly ahead of pg_catalog.
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    (select np.enabled
       from public.notification_preferences np
      where np.org_id = p_org_id
        and np.profile_id = p_profile_id
        and np.notification_type = p_type
        and np.channel = p_channel),
    true
  );
$$;

-- service_role only, deliberately NOT authenticated. This is SECURITY DEFINER
-- and answers for any (member, Family) pair, so granting it to authenticated
-- would hand every signed-in member a read of anyone's mute -- contradicting
-- the RLS decision one migration over that a mute is private to whoever set
-- it. A member reading their OWN preferences goes through the select policy
-- like anything else; the settings UI applies the absent-row default itself.
revoke execute on function public.notification_preference_enabled(uuid, uuid, notification_type, notification_channel) from public;
grant execute on function public.notification_preference_enabled(uuid, uuid, notification_type, notification_channel) to service_role;

-- E1's named edge case for the 09:30 review: "Remove a member from a Family,
-- re-invite later -- old mute rows don't silently apply; defaults are fresh."
--
-- This has to be a trigger rather than a step in a removal action, because
-- accept_invitation() re-uses the existing membership row on re-invite
-- (on conflict (org_id, profile_id) do update set ... deleted_at = null).
-- A preference keyed on (org_id, profile_id) therefore survives a removal and
-- silently re-applies months later to someone who never chose it -- a member
-- who muted the digest during a hard week, left, came back, and quietly never
-- hears from their Family again. There is also no member-removal action in
-- app/actions yet, so there is no code path to add the step to; whichever one
-- gets written later is covered by this without knowing about it.
create or replace function public.reset_notification_preferences_on_membership_end()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  -- OLD is correct for both attachments below: on UPDATE the pair is
  -- unchanged, on DELETE it is all there is.
  delete from public.notification_preferences
   where org_id = old.org_id
     and profile_id = old.profile_id;
  return null;
end;
$$;

revoke execute on function public.reset_notification_preferences_on_membership_end() from public;

-- Soft delete: the shape every path in this repo actually uses.
create trigger memberships_reset_notification_preferences_on_soft_removal
  after update of deleted_at on memberships
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.reset_notification_preferences_on_membership_end();

-- Hard delete: not a path the app uses today. The trigger must not depend on
-- that staying true.
create trigger memberships_reset_notification_preferences_on_removal
  after delete on memberships
  for each row
  execute function public.reset_notification_preferences_on_membership_end();
