-- C2 PR 3. The bucket, the two ceilings, and what pgTAP can honestly say.
--
-- CAN: the bucket exists and is private, the platform-level size limit is set,
-- the policies exist on storage.objects, and check_family_storage_quota()
-- returns the right REASON for each ceiling.
--
-- CANNOT: whether an upload from Family B can reach Family A's object. That is
-- the acceptance criterion the prompt words most strongly and it needs a real
-- session with a real JWT -- pgTAP runs as postgres and bypasses RLS entirely.
-- It belongs to the isolation suite, and its absence here is a gap in this
-- file, not in the fix.

begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

create temporary table _f as
select '00000000-0000-0000-0000-0000000c2a31'::uuid as org_id,
       '00000000-0000-0000-0000-0000000c2a34'::uuid as member_profile,
       '00000000-0000-0000-0000-0000000c2a35'::uuid as member_id;

insert into auth.users (id, email, aud, role)
select member_profile, '_c2-storage@example.test', 'authenticated', 'authenticated' from _f;

insert into public.organizations (id, slug, name)
select org_id, 'c2-storage-probe', 'Storage Probe' from _f;

insert into public.memberships (id, org_id, profile_id, role)
select member_id, org_id, member_profile, 'org_owner'::membership_role from _f;

-- family_storage_bytes() and check_family_storage_quota() are definer functions
-- that guard on is_org_member(), which resolves auth.uid() from the JWT claim.
-- pgTAP connects as postgres with no claim at all, so without this every one of
-- them would return the not-a-member answer and the assertions below would pass
-- for entirely the wrong reason.
-- The CLAIM is set, but the ROLE is left as postgres: is_org_member() resolves
-- the caller from auth.uid(), which reads the claim, and switching role here
-- would make the temporary fixture table unreadable.
select set_config('request.jwt.claims',
  json_build_object('sub', (select member_profile from _f), 'role', 'authenticated')::text,
  true);

-- ---------------------------------------------------------------- the bucket
select is(
  (select count(*)::int from storage.buckets where id = 'family-attachments'),
  1,
  'the bucket is created by the migration, not by config.toml -- config.toml '
  'is not applied to a hosted project, so a bucket declared there exists '
  'locally and is missing in staging'
);

select is(
  (select public from storage.buckets where id = 'family-attachments'),
  false,
  'and it is private -- invariant 9: nothing is public by default'
);

select is(
  (select file_size_limit from storage.buckets where id = 'family-attachments'),
  5242880::bigint,
  'the 5 MB cap is set on the BUCKET ROW, so the platform refuses an oversized '
  'upload even if the app forgets to check'
);

select ok(
  (select 'video/mp4' <> all(allowed_mime_types)
     from storage.buckets where id = 'family-attachments'),
  'video is excluded -- Mux is already that path, and a 5 MB video cap would '
  'be a worse version of a feature that exists'
);

-- --------------------------------------------------------------- the ceilings
select is(
  public.check_family_storage_quota((select org_id from _f), 1024),
  null,
  'a small upload into an empty Family is allowed -- null means "no reason to '
  'refuse", which is the control for the three refusals below'
);

select matches(
  public.check_family_storage_quota((select org_id from _f), 6291456),
  '5 MB',
  'a 6 MB file is refused for being too large, and the message says so'
);

-- The two ceilings must be DISTINGUISHABLE. "Your Family is out of space" is
-- actionable; "the platform is out of space" is not, and telling a member the
-- first when it was the second sends them deleting their own photos for
-- nothing.
select ok(
  public.check_family_storage_quota((select org_id from _f), 5242880) is null,
  'a 5 MB file -- exactly at the cap -- is allowed, so the comparison is > and '
  'not >='
);

-- The per-Family ceiling, exercised rather than asserted about. Twenty 5 MB
-- objects is 100 MB, so the Family is exactly full and the next byte is not
-- the member's file being too big -- it is their Family being out of room.
insert into storage.buckets (id, name, public) values ('family-attachments', 'family-attachments', false)
  on conflict (id) do nothing;

insert into storage.objects (bucket_id, name, metadata)
select 'family-attachments',
       (select org_id from _f)::text || '/00000000-0000-0000-0000-0000000c2a32/f' || g || '.jpg',
       jsonb_build_object('size', 5242880)
  from generate_series(1, 20) g;

select is(
  public.family_storage_bytes((select org_id from _f)),
  104857600::bigint,
  'family_storage_bytes() sums the Family''s own subtree -- 20 x 5 MB'
);

select matches(
  public.check_family_storage_quota((select org_id from _f), 1024),
  'Family',
  'THE TWO CEILINGS ARE DISTINGUISHABLE: a full Family is told its Family is '
  'full, which is actionable'
);

-- And the other direction: a DIFFERENT Family, under its own quota, is not
-- refused by the first Family's usage. Without this, a single global sum would
-- pass every assertion above.
select is(
  public.check_family_storage_quota('00000000-0000-0000-0000-0000000c2a33'::uuid, 1024),
  null,
  'another Family is unaffected -- the per-Family sum is per Family, not a '
  'global total wearing a parameter'
);

-- A NUMBER IS A READ PATH. The first version of family_storage_bytes() was
-- definer with no membership check, so a member of another Family could measure
-- this one's activity. Caught by the isolation suite, not by review; asserted
-- here so it cannot come back.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000c2a36', 'role', 'authenticated')::text,
  true);

select is(
  public.family_storage_bytes((select org_id from _f)),
  0::bigint,
  'a NON-MEMBER measures zero, not the true 100 MB -- an unguarded definer '
  'aggregate hands out a measurement of another Family''s activity'
);

-- ---------------------------------------------------------------- the plumbing
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'family_storage_bytes'),
  true,
  'family_storage_bytes() is definer -- it reads storage.objects, which a '
  'member has no direct grant on'
);

select is(
  (select count(*)::int from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
      and p.polname like 'family_attachments%'),
  3,
  'three policies on storage.objects: select, insert, delete. NO update -- an '
  'upsert past the size limit is the obvious way around the per-file cap'
);

select has_trigger('public', 'messages', 'message_attachments_delete_objects',
  'soft-deleting a message removes its objects, so the quota never counts '
  'bytes a member can no longer reach');

select * from finish();
rollback;
