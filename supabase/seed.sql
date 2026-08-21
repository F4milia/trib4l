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
   'authenticated', 'authenticated', 'alice@trib4l.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Alice"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2',
   'authenticated', 'authenticated', 'bob@trib4l.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Bob"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3',
   'authenticated', 'authenticated', 'carol@trib4l.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Carol"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a4',
   'authenticated', 'authenticated', 'dave@trib4l.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Dave"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a5',
   'authenticated', 'authenticated', 'erin@trib4l.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Erin"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a6',
   'authenticated', 'authenticated', 'frank@trib4l.test', extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Frank"}', now(), now(), '', '', '', '', '', '', '', '');

-- Alice is the overlapping user: a member of Caregiver Circle and a mentor
-- in Founder Collective, with a different display name in each — proves
-- the global-identity/per-org-display split from Session 1 actually works.
insert into memberships (org_id, profile_id, role) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'member'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'mentor'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'organizer'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a3', 'org_owner'),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a4', 'member');

insert into org_profiles (org_id, profile_id, display_name) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Alice'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'Coach A.');

-- Two platform_staff rows, per Invariant 3 (never just one).
insert into platform_staff (profile_id) values
  ('00000000-0000-0000-0000-0000000000a5'),
  ('00000000-0000-0000-0000-0000000000a6');
