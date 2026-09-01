-- Reverse: alter table organizations drop column timezone, drop column
-- table_prompt_time.

-- Wave 1 / E1, PR 1 of 5. Slotted here by docs/v1-repo-audit.md, which found
-- James 17.1's schema half missing and traced two later acceptance criteria
-- that assume it:
--   D2 (Wave 3 B): "Calendar respects the Family's stored timezone"
--   N1 (Wave 4 A): "The daily Table prompt push fires at the Family's chosen
--                   time in the Family's timezone"
-- The audit's note on the cost of letting it slip: "If the columns slip past
-- Wave 2, D2 will either invent a per-user fallback or hardcode UTC."
--
-- profiles.timezone already exists and cannot serve: it is per-user, and a
-- Family Night is one event at one time for the whole Family. Both values are
-- Family-level by nature, so they live on organizations rather than being
-- derived from whoever happens to be looking.
--
-- Not organizations.settings (jsonb, unwritten since Session 1): N1 will
-- select Families whose prompt time has come, which wants a real typed column
-- and eventually an index -- not a jsonb probe with no check constraint.

alter table organizations
  -- A recurring wall-clock time-of-day, meaningful only alongside timezone
  -- below. Not timestamptz: an instant would pin it to one date, and 20:00
  -- has to stay 20:00 across a DST boundary rather than sliding to 19:00.
  add column table_prompt_time time not null default '20:00',
  -- Same check as profiles.timezone. is_valid_iana_timezone() tests against
  -- pg_timezone_names rather than `at time zone`, so a raw offset like
  -- '+02:00' is rejected -- an offset looks like a timezone and silently
  -- stops tracking DST, which is exactly the bug D2's calendar would ship.
  add column timezone text not null default 'UTC'
    check (is_valid_iana_timezone(timezone));

comment on column organizations.table_prompt_time is
  'Wall-clock time of day the Family''s Table prompt opens, read together with organizations.timezone. Consumed by N1 (Wave 4).';
comment on column organizations.timezone is
  'IANA zone name for the Family as a whole. Distinct from profiles.timezone, which is per-member.';

-- No trigger work: organizations already carries organizations_audit in
-- 'self' mode (20260902100302), so both columns are audited from this commit
-- onward without anything further. Test 060 asserts that rather than trusting
-- it.
