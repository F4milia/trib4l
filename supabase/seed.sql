-- Local/staging seed data. Exists so isolation bugs show up now, not after
-- launch — a single-org dev environment can't reveal a cross-tenant leak.
-- Never run against production.

insert into organizations (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000a', 'caregiver-circle', 'Caregiver Circle'),
  ('00000000-0000-0000-0000-00000000000b', 'founder-collective', 'Founder Collective'),
  ('00000000-0000-0000-0000-00000000000c', 'wellness-guild', 'Wellness Guild');

-- auth.users rows, seeded directly (local/staging only — this bypasses the
-- normal signup flow on purpose). Every row here gets a profiles row for
-- free via the handle_new_user trigger from the previous migration.
-- email_change/email_change_token_*/phone_change* default to NULL, but
-- GoTrue's Go driver can't scan a NULL into the string fields it expects --
-- signInWithPassword fails with "Database error querying schema" until
-- these are explicitly empty strings, not just confirmation/recovery_token.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1',
   'authenticated', 'authenticated', 'alice@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Alice"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2',
   'authenticated', 'authenticated', 'bob@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Bob"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3',
   'authenticated', 'authenticated', 'carol@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Carol"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a4',
   'authenticated', 'authenticated', 'dave@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Dave"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a5',
   'authenticated', 'authenticated', 'erin@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Erin"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a6',
   'authenticated', 'authenticated', 'frank@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Frank"}', now(), now(), '', '', '', '', '', '', '', '');

-- Alice is the overlapping user: a member of Caregiver Circle and a mentor
-- in Founder Collective, with a different display name in each — proves
-- the global-identity/per-org-display split from Session 1 actually works.
--
-- Membership ids are EXPLICIT from here on. They were previously left to
-- gen_random_uuid(), which was fine while nothing referenced them -- but
-- towers, bricks, vows and table_entries all key off membership_id, and a
-- fixture whose ids change on every `db reset` cannot be referenced by the
-- domain rows below, by a Playwright spec, or by a person reading psql output.
-- Nothing depended on the old random values, so this is additive.
insert into memberships (id, org_id, profile_id, role) values
  ('00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'member'),
  ('00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'mentor'),
  ('00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'organizer'),
  ('00000000-0000-0000-0000-000000010004', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a3', 'org_owner'),
  ('00000000-0000-0000-0000-000000010005', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a4', 'member');

insert into org_profiles (org_id, profile_id, display_name) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Alice'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'Coach A.');

-- Two platform_staff rows, per Invariant 3 (never just one).
insert into platform_staff (profile_id) values
  ('00000000-0000-0000-0000-0000000000a5'),
  ('00000000-0000-0000-0000-0000000000a6');

-- ===========================================================================
-- DOMAIN DATA -- the Tower, the Bricks, the Table, the Vow, the Ledger.
-- ===========================================================================
--
-- D1's acceptance has two clauses that pull in opposite directions on purpose:
--
--   "every element reflects live seeded data"
--   "loads correctly for a brand-new Family with no Tower yet -- honest empty
--    states, no invented placeholders"
--
-- So the seed has to contain a Family with a full history AND a Family with
-- nothing. It also has to make D1's named edge case mean something:
--
--   "Dual-Family member switches Families -- Tower, streak, Vow holder all
--    switch with zero bleed."
--
-- Alice is that member. IDENTICAL DATA IN BOTH FAMILIES WOULD PASS THAT CHECK
-- WHILE PROVING NOTHING, so everything she can see is deliberately different
-- on each side:
--
--                        Caregiver Circle        Founder Collective
--   Tower                Bring Mum home          Ship the pilot
--   Streak               6                       3
--   Vow holder           Bob                     Carol
--   Her claimed Bricks   2 open (1 overdue)      none
--   The Family's today   nobody has written      Carol has written
--
-- Element 4, "today's Table prompt status", is the one thing that does NOT
-- differ for Alice: family_table_day() answers per MEMBER, and she has not
-- written today in either Family, so it reads "not written" on both sides.
-- Said plainly rather than engineered away -- making it differ would mean
-- either having her write today in Caregiver Circle, which shows element 4's
-- finished state forever and never its actionable one, or seeding mentor
-- activity in Founder Collective, which decides an open question. The four
-- elements above are what carry the edge case.
--
-- Wellness Guild is deliberately empty: no Tower, no Builds, no Bricks, no
-- entries, no Vow, no Ledger. That is what element 6's empty state renders
-- from, and an empty Family is a real state (F3.5's "quiet season"), not a
-- gap in the fixture.
--
-- TWO THINGS THIS SEED DELIBERATELY DOES NOT DO:
--
--   mood_tags stays EMPTY. Spec 10.5 does not specify the permitted set, and
--   20260903101011 ships the table unseeded on purpose -- inventing a mood
--   vocabulary here would put invented product into the fixture that every
--   future session reads. Entries carry a null mood_tag_id.
--
--   Alice, a MENTOR in Founder Collective, writes no Table entries and holds
--   no Bricks there. Whether a mentor participates in the Table, or even sees
--   the dashboard, is unspecified anywhere -- spec 10.1 excludes mentors from
--   the twelve-member cap, so they are already a distinct kind of participant.
--   Seeding mentor activity would bake an answer into the fixture. The
--   question stays open and visible instead; D1 has to answer it, or say
--   plainly that it is not answering it.
--
-- Dates are RELATIVE to current_date, so the fixture is always "now" and
-- today's-prompt state is real rather than a date that went stale. Both
-- populated Families are on the default UTC timezone, so current_date and
-- family_table_day()'s (now() at time zone o.timezone)::date agree. Give a
-- Family a non-UTC timezone and that stops being true near midnight -- a
-- legitimate thing to test, but not silently, and not here.

-- --------------------------------------------------------------- prompts
-- Two platform-wide (org_id null) and one Family-authored, which exercises
-- both halves of 20260903101011's nullable-org design and gives the
-- cross-Family prompt trigger something real to be right about.
insert into table_prompts (id, org_id, body) values
  ('00000000-0000-0000-0000-000000060001', null,
   'What did today take out of you, and what put something back?'),
  ('00000000-0000-0000-0000-000000060002', null,
   'Who did you lean on this week?'),
  ('00000000-0000-0000-0000-000000060003', '00000000-0000-0000-0000-00000000000a',
   'What would make tomorrow on the ward easier?');

-- =================================================== CAREGIVER CIRCLE (org a)
insert into towers (id, org_id, title, description, status) values
  ('00000000-0000-0000-0000-000000020001', '00000000-0000-0000-0000-00000000000a',
   'Bring Mum home',
   'Get the house ready and the care rota covered so she can be discharged.',
   'active');

update organizations set active_tower_id = '00000000-0000-0000-0000-000000020001'
 where id = '00000000-0000-0000-0000-00000000000a';

insert into builds (id, tower_id, org_id, type, title, status) values
  ('00000000-0000-0000-0000-000000030001', '00000000-0000-0000-0000-000000020001',
   '00000000-0000-0000-0000-00000000000a', 'custom', 'Adapt the house', 'open'),
  ('00000000-0000-0000-0000-000000030002', '00000000-0000-0000-0000-000000020001',
   '00000000-0000-0000-0000-00000000000a', 'custom', 'Build the care rota', 'complete');

-- Bricks in four different states, so the dashboard has something to render
-- for each and the masonry is partially filled rather than 0% or 100%.
-- Alice holds two, and ONE OF THEM IS OVERDUE -- D1 renders "their claimed
-- Bricks with due windows", and a fixture where every date sits comfortably
-- in the future never shows the overdue treatment to anyone reviewing it.
insert into bricks (id, build_id, org_id, description, assignee, due_at, status) values
  ('00000000-0000-0000-0000-000000040001', '00000000-0000-0000-0000-000000030001',
   '00000000-0000-0000-0000-00000000000a', 'Fit the stair rail',
   '00000000-0000-0000-0000-000000010001', now() + interval '3 days', 'in_progress'),
  ('00000000-0000-0000-0000-000000040002', '00000000-0000-0000-0000-000000030001',
   '00000000-0000-0000-0000-00000000000a', 'Order the shower seat',
   '00000000-0000-0000-0000-000000010001', now() - interval '1 day', 'in_progress'),
  ('00000000-0000-0000-0000-000000040004', '00000000-0000-0000-0000-000000030001',
   '00000000-0000-0000-0000-00000000000a', 'Clear the hallway',
   '00000000-0000-0000-0000-000000010002', now() + interval '5 days', 'needs_help');

-- Unclaimed, and it must render as open rather than attributed to anyone --
-- that is D2's first acceptance criterion.
insert into bricks (id, build_id, org_id, description, due_at, status) values
  ('00000000-0000-0000-0000-000000040003', '00000000-0000-0000-0000-000000030001',
   '00000000-0000-0000-0000-00000000000a', 'Ask the OT about the ramp',
   now() + interval '7 days', 'open');

-- The completed Build's two Bricks. Peer-verified in both directions, because
-- bricks_verifier_is_not_assignee refuses self-verification and a fixture that
-- only ever verified one way round would not notice if that broke.
insert into bricks (id, build_id, org_id, description, assignee, verified_by, verified_at, status) values
  ('00000000-0000-0000-0000-000000040005', '00000000-0000-0000-0000-000000030002',
   '00000000-0000-0000-0000-00000000000a', 'Draft the week one rota',
   '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000010002',
   now() - interval '9 days', 'done'),
  ('00000000-0000-0000-0000-000000040006', '00000000-0000-0000-0000-000000030002',
   '00000000-0000-0000-0000-00000000000a', 'Confirm Thursday cover',
   '00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000010001',
   now() - interval '7 days', 'done');

-- The Vow: Bob holds the open one, and Alice holds a COMPLETED one so
-- next_vow_holder() has real rotation history to read rather than falling
-- back on join order.
insert into vows (id, org_id, holder_id, commitment, status, assigned_at, completed_at) values
  ('00000000-0000-0000-0000-000000050002', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-000000010001', 'I will keep the shared calendar current',
   'complete', now() - interval '25 days', now() - interval '12 days'),
  ('00000000-0000-0000-0000-000000050001', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-000000010002', 'I will ring the ward every morning before work',
   'active', now() - interval '10 days', null);

-- The Table. Distinct days: 1, 2, 3, 5, 6, 8 back -> STREAK OF 6.
-- Alice has NOT written today, deliberately: element 4 is "today's Table
-- prompt status", and its interesting state is the actionable one. A seed
-- where the demo user has already written shows the finished state forever.
insert into table_entries (org_id, member_id, entry_date, prompt_id, response_text) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000010001', current_date - 1, '00000000-0000-0000-0000-000000060001', 'Ward round moved again. Took the afternoon off and slept.'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000010001', current_date - 2, '00000000-0000-0000-0000-000000060003', 'A proper handover sheet would save an hour every visit.'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000010001', current_date - 3, '00000000-0000-0000-0000-000000060001', 'Good day. She knew me straight away.'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000010001', current_date - 5, '00000000-0000-0000-0000-000000060002', 'Bob did the Tuesday run so I could work.'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000010002', current_date - 1, '00000000-0000-0000-0000-000000060001', 'Long one. The rail arrives Thursday.'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000010002', current_date - 3, '00000000-0000-0000-0000-000000060002', 'Alice, mostly. As usual.'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000010002', current_date - 6, '00000000-0000-0000-0000-000000060003', 'Somewhere to park.'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000010002', current_date - 8, '00000000-0000-0000-0000-000000060001', 'Nothing left. Tomorrow is another one.');

-- The Ledger: the Family's own narrative history, in plain language (F3.4).
-- Explicitly NOT audit_log -- a member reads this one.
insert into ledger_events (org_id, event_type, payload, created_at) values
  ('00000000-0000-0000-0000-00000000000a', 'tower_event',
   '{"summary": "Caregiver Circle set its Tower: bring Mum home."}', now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000000000a', 'vow_event',
   '{"summary": "Alice completed her Vow to keep the shared calendar current."}', now() - interval '12 days'),
  ('00000000-0000-0000-0000-00000000000a', 'vow_event',
   '{"summary": "Bob took the Vow: ring the ward every morning before work."}', now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000000a', 'brick_complete',
   '{"summary": "Alice drafted the week one rota. Bob confirmed it."}', now() - interval '9 days'),
  ('00000000-0000-0000-0000-00000000000a', 'brick_complete',
   '{"summary": "Bob confirmed Thursday cover. Alice signed it off."}', now() - interval '7 days'),
  ('00000000-0000-0000-0000-00000000000a', 'build_complete',
   '{"summary": "The care rota is covered."}', now() - interval '7 days');

-- ================================================= FOUNDER COLLECTIVE (org b)
-- Alice's OTHER Family. Everything she can see here differs from above; that
-- difference is the entire point of the fixture.
insert into towers (id, org_id, title, description, status) values
  ('00000000-0000-0000-0000-000000020002', '00000000-0000-0000-0000-00000000000b',
   'Ship the pilot to ten families',
   'Get the first ten Families onto the pilot and hear what breaks.',
   'active');

update organizations set active_tower_id = '00000000-0000-0000-0000-000000020002'
 where id = '00000000-0000-0000-0000-00000000000b';

insert into builds (id, tower_id, org_id, type, title, status) values
  ('00000000-0000-0000-0000-000000030003', '00000000-0000-0000-0000-000000020002',
   '00000000-0000-0000-0000-00000000000b', 'propagation',
   'Close the first ten conversations', 'open');

-- Carol holds both. No done Bricks here, and that is not laziness: the only
-- other membership in this Family is Alice's MENTOR row, so verifying one
-- would decide whether a mentor can peer-verify -- F4.7 says "any member other
-- than the assignee", and whether that includes a mentor is unspecified.
insert into bricks (id, build_id, org_id, description, assignee, due_at, status) values
  ('00000000-0000-0000-0000-000000040007', '00000000-0000-0000-0000-000000030003',
   '00000000-0000-0000-0000-00000000000b', 'Write the outreach note',
   '00000000-0000-0000-0000-000000010004', now() + interval '2 days', 'in_progress'),
  ('00000000-0000-0000-0000-000000040008', '00000000-0000-0000-0000-000000030003',
   '00000000-0000-0000-0000-00000000000b', 'List ten candidate Families',
   '00000000-0000-0000-0000-000000010004', now() + interval '6 days', 'pending_verification');

insert into vows (id, org_id, holder_id, commitment, status, assigned_at) values
  ('00000000-0000-0000-0000-000000050003', '00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-000000010004', 'I will send the Friday update, every Friday',
   'active', now() - interval '4 days');

-- Distinct days: 0, 2, 4 back -> STREAK OF 3, against Caregiver Circle's 6.
-- Somebody HAS written today here, where Alice has not written today there,
-- so element 4 differs across the switch as well as elements 3, 5 and 6.
insert into table_entries (org_id, member_id, entry_date, prompt_id, response_text) values
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000010004', current_date, '00000000-0000-0000-0000-000000060001', 'Three calls, two yeses. Good day.'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000010004', current_date - 2, '00000000-0000-0000-0000-000000060002', 'Alice talked me out of rewriting the deck. Again.'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000010004', current_date - 4, '00000000-0000-0000-0000-000000060001', 'Slow. Nobody replied.');

insert into ledger_events (org_id, event_type, payload, created_at) values
  ('00000000-0000-0000-0000-00000000000b', 'tower_event',
   '{"summary": "Founder Collective set its Tower: ship the pilot to ten families."}', now() - interval '14 days'),
  ('00000000-0000-0000-0000-00000000000b', 'vow_event',
   '{"summary": "Carol took the Vow: send the Friday update, every Friday."}', now() - interval '4 days');

-- ==================================================== WELLNESS GUILD (org c)
-- Nothing, on purpose. Dave is its only member and it has no Tower, no
-- Builds, no Bricks, no Table entries, no Vow and no Ledger events. This is
-- what D1's second acceptance clause renders from, and there is nothing to
-- add here -- an empty Family is a state the product has to be honest about,
-- not a hole in the fixture.

-- ===========================================================================
-- QA FIXTURES -- docs/qa-previous-session-sop.md, prerequisite 2.
-- ===========================================================================
--
-- "The wave table's edge cases keep using the same actors. Seed them once in
--  supabase/seed.sql with stable emails, and every QA doc references them by
--  name instead of 'create a user who...'."
--
-- Each account below is named for the STATE IT IS IN, not for a person, so a
-- QA step can say "log in as departed@f4milia.test" and mean something exact.
--
-- THEY LIVE IN THEIR OWN TWO FAMILIES, and that is the important design
-- decision here. caregiver-circle, founder-collective and wellness-guild are
-- pinned by 26 isolation files and by 180_seed_domain_data.sql -- their member
-- counts, streaks and Tower titles are asserted. Putting a departed member or
-- a memorial lock into one of them would perturb assertions that exist to
-- catch real regressions, and every future QA fixture would perturb them
-- again. qa-family-a and qa-family-b are separate so the two fixture sets
-- cannot interfere.
--
-- Password for every account is the same as the rest of this file. The SOP
-- says the shared password belongs in the team password manager rather than
-- the repo; that applies to STAGING. This file is local/staging seed data and
-- already carries password123 for six accounts, so a different rule for these
-- nine would be a false sense of security, not a real one.

insert into organizations (id, slug, name) values
  ('00000000-0000-0000-0000-00000000000d', 'qa-family-a', 'QA Family A'),
  ('00000000-0000-0000-0000-00000000000e', 'qa-family-b', 'QA Family B');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1',
   'authenticated', 'authenticated', 'dual@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Dual Family"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b2',
   'authenticated', 'authenticated', 'blocker@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Blocker"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b3',
   'authenticated', 'authenticated', 'blocked@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Blocked"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b4',
   'authenticated', 'authenticated', 'departed@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Departed"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b5',
   'authenticated', 'authenticated', 'memorial@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Memorial"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b6',
   'authenticated', 'authenticated', 'second@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Second Member"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b7',
   'authenticated', 'authenticated', 'orphan@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"No Family"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b8',
   'authenticated', 'authenticated', 'staff1@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Staff One"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b9',
   'authenticated', 'authenticated', 'staff2@f4milia.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Staff Two"}', now(), now(), '', '', '', '', '', '', '', '');

-- orphan@ gets NO membership at all. That absence is the fixture: O1's edge
-- case, W2's first-run, and every "signed up but has not joined" path need a
-- person in exactly this state, and creating one by hand each time is what
-- the SOP exists to stop.
insert into memberships (id, org_id, profile_id, role) values
  -- qa-family-a. dual@ created it, so second@ is genuinely a non-creator.
  ('00000000-0000-0000-0000-000000019001', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000b1', 'org_owner'),
  ('00000000-0000-0000-0000-000000019002', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000b6', 'member'),
  ('00000000-0000-0000-0000-000000019003', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000b2', 'member'),
  ('00000000-0000-0000-0000-000000019004', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000b3', 'member'),
  ('00000000-0000-0000-0000-000000019005', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000b4', 'member'),
  ('00000000-0000-0000-0000-000000019006', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000b5', 'member'),
  -- qa-family-b, so dual@ is in two Families with different content in each.
  ('00000000-0000-0000-0000-000000019007', '00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000b1', 'member');

insert into platform_staff (profile_id) values
  ('00000000-0000-0000-0000-0000000000b8'),
  ('00000000-0000-0000-0000-0000000000b9');

-- 2FA, seeded verified. Invariant 7 ENFORCES two-factor for platform_staff at
-- sign-in, so a staff fixture without a factor cannot reach a single staff
-- route -- and enrolling one by hand after every `db reset` is exactly the
-- friction the SOP is trying to remove.
--
-- The secret is a published RFC 4226 test vector, stored the way GoTrue stores
-- one: plaintext base32 in auth.mfa_factors.secret (verified against factors
-- this repo's own elevateToAal2 helper had already created). Generate a code
-- from it with any TOTP app or with otpauth in a test:
--
--   new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(QA_TOTP_SECRET) })
--
-- If a future GoTrue enables at-rest encryption of this column these rows stop
-- working, and the symptom will be "invalid code" rather than anything about
-- encryption -- so check the column's format before debugging the code.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret) values
  ('00000000-0000-0000-0000-000000069001', '00000000-0000-0000-0000-0000000000b8',
   'qa-seeded', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'),
  ('00000000-0000-0000-0000-000000069002', '00000000-0000-0000-0000-0000000000b9',
   'qa-seeded', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');

-- ----------------------------------------------------- qa-family-a content
insert into towers (id, org_id, title, description, status) values
  ('00000000-0000-0000-0000-000000029001', '00000000-0000-0000-0000-00000000000d',
   'Finish the allotment shed', 'Somewhere to keep the tools and sit out of the rain.', 'active');

update organizations set active_tower_id = '00000000-0000-0000-0000-000000029001'
 where id = '00000000-0000-0000-0000-00000000000d';

insert into builds (id, tower_id, org_id, type, title, status) values
  ('00000000-0000-0000-0000-000000039001', '00000000-0000-0000-0000-000000029001',
   '00000000-0000-0000-0000-00000000000d', 'custom', 'Frame and roof', 'open');

-- departed@ holds two Bricks and has finished a third. After the departure
-- below, 20260903100911's trigger reverts the two open ones to unassigned and
-- leaves the finished one attributed -- which is D2's named edge case and
-- K1's, in one fixture.
insert into bricks (id, build_id, org_id, description, assignee, due_at, status) values
  ('00000000-0000-0000-0000-000000049001', '00000000-0000-0000-0000-000000039001',
   '00000000-0000-0000-0000-00000000000d', 'Concrete the base',
   '00000000-0000-0000-0000-000000019005', now() + interval '4 days', 'in_progress'),
  ('00000000-0000-0000-0000-000000049002', '00000000-0000-0000-0000-000000039001',
   '00000000-0000-0000-0000-00000000000d', 'Order the timber',
   '00000000-0000-0000-0000-000000019005', now() - interval '2 days', 'needs_help');

insert into bricks (id, build_id, org_id, description, assignee, verified_by, verified_at, status) values
  ('00000000-0000-0000-0000-000000049003', '00000000-0000-0000-0000-000000039001',
   '00000000-0000-0000-0000-00000000000d', 'Clear the plot',
   '00000000-0000-0000-0000-000000019005', '00000000-0000-0000-0000-000000019001',
   now() - interval '6 days', 'done');

insert into vows (id, org_id, holder_id, commitment, status, assigned_at) values
  ('00000000-0000-0000-0000-000000059001', '00000000-0000-0000-0000-00000000000d',
   '00000000-0000-0000-0000-000000019002', 'I will water the plot on Wednesdays',
   'active', now() - interval '6 days');

-- blocked@ has written, so the block below has real content to hide and
-- invariant 6 is QA-able without composing anything first. memorial@ has
-- written too, so the lock has something to preserve.
insert into table_entries (org_id, member_id, entry_date, prompt_id, response_text) values
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000019004', current_date - 1, '00000000-0000-0000-0000-000000060001', 'Wrote this so a blocked account has something to hide.'),
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000019004', current_date - 3, '00000000-0000-0000-0000-000000060002', 'And a second one, on a different day.'),
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000019006', current_date - 2, '00000000-0000-0000-0000-000000060001', 'Written before the account was memorialised. It stays.'),
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000019001', current_date - 1, '00000000-0000-0000-0000-000000060001', 'The Family keeps going.');

insert into ledger_events (org_id, event_type, payload, created_at) values
  ('00000000-0000-0000-0000-00000000000d', 'tower_event',
   '{"summary": "QA Family A set its Tower: finish the allotment shed."}', now() - interval '20 days'),
  ('00000000-0000-0000-0000-00000000000d', 'brick_complete',
   '{"summary": "Departed cleared the plot before they left."}', now() - interval '6 days');

-- ----------------------------------------------------- qa-family-b content
-- Deliberately DIFFERENT from Family A, for the same reason the main fixture's
-- two Families differ: dual@ switching between them has to change what is on
-- screen, or the switch proves nothing.
insert into towers (id, org_id, title, description, status) values
  ('00000000-0000-0000-0000-000000029002', '00000000-0000-0000-0000-00000000000e',
   'Run the winter supper club', 'Once a month, somebody else cooks.', 'active');

update organizations set active_tower_id = '00000000-0000-0000-0000-000000029002'
 where id = '00000000-0000-0000-0000-00000000000e';

insert into vows (id, org_id, holder_id, commitment, status, assigned_at) values
  ('00000000-0000-0000-0000-000000059002', '00000000-0000-0000-0000-00000000000e',
   '00000000-0000-0000-0000-000000019007', 'I will book the hall by the 20th',
   'active', now() - interval '2 days');

insert into table_entries (org_id, member_id, entry_date, prompt_id, response_text) values
  ('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000019007', current_date, '00000000-0000-0000-0000-000000060001', 'Different Family, different day, different answer.');

-- ------------------------------------------------------------- the states
-- Order matters below: each of these three is a TRANSITION, and seeding the
-- end state directly would skip the trigger that produces it.

-- 1. The block. blocker@ has blocked blocked@, so blocked@'s two entries above
--    are hidden from blocker@ SPECIFICALLY and from nobody else.
insert into member_blocks (org_id, blocker_membership_id, blocked_membership_id) values
  ('00000000-0000-0000-0000-00000000000d',
   '00000000-0000-0000-0000-000000019003',
   '00000000-0000-0000-0000-000000019004');

-- 2. The departure. A SOFT delete, because that is what leaving a Family is
--    here -- and it fires memberships_release_bricks, which is the whole
--    point: after this, 049001 and 049002 are open and unassigned while
--    049003 stays done and still attributed to departed@.
update memberships set deleted_at = now()
 where id = '00000000-0000-0000-0000-000000019005';

-- 3. The memorial lock. Set on the profile, which is where 20260903100401
--    puts it; memorial@'s entries stay visible and stop being editable.
update profiles set memorialized_at = now(), memorialized_by = '00000000-0000-0000-0000-0000000000b8'
 where id = '00000000-0000-0000-0000-0000000000b5';
