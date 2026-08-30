-- Per-Family notification preferences -- Ferenz 12.3, the item
-- docs/v1-repo-audit.md marks missing and names as the one "James's 13.1 and
-- the run doc's N1 both consume".
--
-- Two decisions this file exists to pin down, because both are invisible in
-- the schema and both are load-bearing for later waves:
--
-- 1. ABSENCE OF A ROW IS THE DEFAULT, AND THE DEFAULT IS SUBSCRIBED. A row
--    exists only where a member has expressed a choice. The alternative --
--    seeding a row per (member x type x channel) on join -- turns every new
--    notification type into a backfill, and turns E1's named edge case into a
--    backfill too.
--
-- 2. LOSING MEMBERSHIP DELETES THE ROWS. That is E1's named edge case for the
--    09:30 review: "Remove a member from a Family, re-invite later -- old mute
--    rows don't silently apply; defaults are fresh." Enforced by trigger, not
--    by whichever code path happens to remove a member -- accept_invitation()
--    already un-deletes an existing membership row rather than making a new
--    one (on conflict ... do update set deleted_at = null), so a preference
--    keyed on (org_id, profile_id) WOULD survive a removal and silently
--    re-apply on re-join. The trigger is what makes that false.

begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ------------------------------------------------------------------- shape
select has_table('public', 'notification_preferences',
  'notification_preferences exists');
select has_column('public', 'notification_preferences', 'org_id',
  'preferences are per-Family, not global -- invariant 3');
select has_column('public', 'notification_preferences', 'profile_id',
  'preferences are per-member');
select has_column('public', 'notification_preferences', 'notification_type',
  'preferences are per-type -- N1 extends this enum, it does not replace it');
select has_column('public', 'notification_preferences', 'channel',
  'the channel dimension exists from day one so N1 adds a value, not a column');
select col_not_null('public', 'notification_preferences', 'enabled',
  'enabled is a boolean, not a tri-state -- absence already means default');

select col_is_unique(
  'public', 'notification_preferences',
  array['org_id', 'profile_id', 'notification_type', 'channel'],
  'one row per member per Family per type per channel'
);

select hasnt_column('public', 'notification_preferences', 'deleted_at',
  'no soft delete -- deleting a preference row means "back to default", and the membership trigger has to actually remove rows');

-- -------------------------------------------------------------------- RLS
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.notification_preferences'::regclass),
  'row level security is enabled'
);

-- Least privilege, per the 2026-08-29 learned constraint that grants here are
-- per-migration and "the service role reads everything" is false in this
-- repo. The send path reads one boolean through the function below; it has no
-- reason to be able to enumerate who muted what.
-- DML specifically. Supabase's own ALTER DEFAULT PRIVILEGES hands every new
-- table in public a REFERENCES/TRIGGER/TRUNCATE grant to anon, authenticated
-- and service_role before any migration runs -- true of all 33 existing tables
-- here, not something this migration chose. The claim worth asserting is the
-- one a migration controls: no read or write.
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'notification_preferences'
      and grantee = 'service_role'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
  0,
  'service_role can neither read nor write notification_preferences -- it gets EXECUTE on the function instead'
);

select ok(
  (select count(distinct privilege_type)::int from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'notification_preferences'
      and grantee = 'authenticated'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) = 4,
  'authenticated can read, set, change and clear its own preferences'
);

-- ------------------------------------------------------------------ audit
-- Invariant 5: a new table gets its trigger in the same migration that
-- creates it.
select has_trigger('public', 'notification_preferences', 'notification_preferences_audit',
  'the audit trigger ships in the same migration as the table');

-- ----------------------------------------------------------------- probes
-- A real seeded org and a real seeded member of it (alice in caregiver-circle,
-- per supabase/seed.sql and tests/isolation/helpers.ts).
create temporary table _np_probe as
  select '00000000-0000-0000-0000-00000000000a'::uuid as org_id,
         (select profile_id from public.memberships
           where org_id = '00000000-0000-0000-0000-00000000000a'
             and deleted_at is null
           order by created_at limit 1) as profile_id;

select isnt(
  (select profile_id from _np_probe), null,
  'the probe found a real seeded member to work with'
);

-- --------------------------------------------- absence is the default
select ok(
  (select public.notification_preference_enabled(
     org_id, profile_id, 'family_night_digest', 'email') from _np_probe),
  'no row means subscribed -- a member who has never touched a setting gets the digest'
);

insert into public.notification_preferences
  (org_id, profile_id, notification_type, channel, enabled)
select org_id, profile_id, 'family_night_digest', 'email', false from _np_probe;

select ok(
  not (select public.notification_preference_enabled(
     org_id, profile_id, 'family_night_digest', 'email') from _np_probe),
  'an enabled=false row mutes that type in that Family'
);

-- Invariant 3's per-Family rule, at the schema layer: muting one type says
-- nothing about any other type in the same Family.
select ok(
  (select public.notification_preference_enabled(
     org_id, profile_id, 'vow_notification', 'email') from _np_probe),
  'muting the digest does not mute Vow notifications -- per-type, not one switch'
);

select is(
  (select count(*)::int from public.audit_log
    where target_type = 'notification_preferences'
      and action = 'notification_preferences.insert'
      and org_id = (select org_id from _np_probe)),
  1,
  'setting a preference writes exactly one audit row'
);

-- ------------------------------------- the named edge case, both removal paths
-- Soft delete: the shape every app path in this repo uses.
update public.memberships set deleted_at = now()
 where org_id = (select org_id from _np_probe)
   and profile_id = (select profile_id from _np_probe);

select is(
  (select count(*)::int from public.notification_preferences
    where org_id = (select org_id from _np_probe)
      and profile_id = (select profile_id from _np_probe)),
  0,
  'soft-deleting a membership clears that member''s preferences for that Family'
);

select ok(
  (select public.notification_preference_enabled(
     org_id, profile_id, 'family_night_digest', 'email') from _np_probe),
  're-invited, the member is back to the default -- the old mute does not silently apply'
);

-- The trigger-driven delete is itself a mutation, so it is itself audited.
-- org_id on the row, not metadata.org_id_at_delete: that key is written only
-- when the org itself is gone (20260902100303), and here the Family outlives
-- the membership.
select ok(
  (select count(*)::int from public.audit_log
    where target_type = 'notification_preferences'
      and action = 'notification_preferences.delete'
      and org_id = (select org_id from _np_probe)) >= 1,
  'clearing preferences on removal is audited like any other mutation'
);

-- Re-joining does not resurrect anything: accept_invitation() un-deletes the
-- same membership row, and there is nothing left to come back.
update public.memberships set deleted_at = null
 where org_id = (select org_id from _np_probe)
   and profile_id = (select profile_id from _np_probe);

select is(
  (select count(*)::int from public.notification_preferences
    where org_id = (select org_id from _np_probe)
      and profile_id = (select profile_id from _np_probe)),
  0,
  're-joining does not resurrect the cleared rows'
);

-- Hard delete: not a path the app uses today, but the trigger must not depend
-- on that staying true.
insert into public.notification_preferences
  (org_id, profile_id, notification_type, channel, enabled)
select org_id, profile_id, 'vow_notification', 'email', false from _np_probe;

delete from public.memberships
 where org_id = (select org_id from _np_probe)
   and profile_id = (select profile_id from _np_probe);

select is(
  (select count(*)::int from public.notification_preferences
    where org_id = (select org_id from _np_probe)
      and profile_id = (select profile_id from _np_probe)),
  0,
  'hard-deleting a membership clears preferences too'
);

-- ------------------------------------------------- the function itself
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'notification_preference_enabled'),
  true,
  'notification_preference_enabled is SECURITY DEFINER -- the send path has no session'
);

select ok(
  not has_function_privilege('public',
    'public.notification_preference_enabled(uuid,uuid,notification_type,notification_channel)',
    'execute'),
  'EXECUTE is revoked from PUBLIC'
);

-- The function answers for ANY (member, Family) pair, so granting it to
-- authenticated would hand every signed-in member a read of anyone's mute --
-- exactly what the select policy refuses. Members read their own rows through
-- RLS instead.
select ok(
  not has_function_privilege('authenticated',
    'public.notification_preference_enabled(uuid,uuid,notification_type,notification_channel)',
    'execute'),
  'authenticated cannot execute it -- a mute stays private to whoever set it'
);

select ok(
  has_function_privilege('service_role',
    'public.notification_preference_enabled(uuid,uuid,notification_type,notification_channel)',
    'execute'),
  'service_role can -- the send path has no session and needs the effective value'
);

select * from finish();
rollback;
