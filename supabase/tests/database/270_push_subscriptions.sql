-- Stream A unblocking, PR 10.

begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

create temporary table _f as
select '00000000-0000-0000-0000-0000000c2a41'::uuid as org_a,
       '00000000-0000-0000-0000-0000000c2a42'::uuid as org_b,
       '00000000-0000-0000-0000-0000000c2a43'::uuid as profile_id,
       '00000000-0000-0000-0000-0000000c2a44'::uuid as membership_a,
       '00000000-0000-0000-0000-0000000c2a45'::uuid as membership_b;

insert into auth.users (id, email, aud, role)
select profile_id, '_c2-push@example.test', 'authenticated', 'authenticated' from _f;

insert into public.organizations (id, slug, name)
select org_a, 'push-probe-a', 'Push Probe A' from _f
union all select org_b, 'push-probe-b', 'Push Probe B' from _f;

-- The dual-Family shape, in miniature: one person, two Families.
insert into public.memberships (id, org_id, profile_id, role)
select membership_a, org_a, profile_id, 'org_owner'::membership_role from _f
union all select membership_b, org_b, profile_id, 'org_owner'::membership_role from _f;

select has_table('public', 'push_subscriptions', 'push_subscriptions exists');

select has_trigger('public', 'push_subscriptions', 'push_subscriptions_audit',
  'invariant 5: the audit trigger arrives with the table');

select has_column('public', 'push_subscriptions', 'membership_id',
  'keyed on membership, not profile');

-- Invariant 3's per-Family rule, made structural. The same person in two
-- Families holds two subscriptions, so silencing one is possible.
select lives_ok(
  $$
    insert into public.push_subscriptions (org_id, membership_id, endpoint, p256dh, auth)
    select org_a, membership_a, 'https://push.example/a', 'k', 'a' from _f
  $$,
  'a member subscribes in Family A'
);

select lives_ok(
  $$
    insert into public.push_subscriptions (org_id, membership_id, endpoint, p256dh, auth)
    select org_b, membership_b, 'https://push.example/b', 'k', 'a' from _f
  $$,
  'and separately in Family B -- per-Family, never one global mute'
);

-- One device, one row, globally. Without this a member in two Families who
-- re-subscribes on the same browser receives every notification twice.
select throws_ok(
  $$
    insert into public.push_subscriptions (org_id, membership_id, endpoint, p256dh, auth)
    select org_b, membership_b, 'https://push.example/a', 'k', 'a' from _f
  $$,
  '23505',
  null,
  'the same endpoint cannot be registered twice -- one device is one row, or a '
  'dual-Family member gets every notification twice on it'
);

-- The defence against redirecting someone else's notifications is the ABSENCE
-- of the grant, not a policy: RLS cannot restrict which columns an UPDATE
-- writes.
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'push_subscriptions'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  0,
  'authenticated has NO UPDATE grant -- an UPDATE grant here would let a member '
  'rewrite membership_id and redirect another member''s notifications to their '
  'own device'
);

select has_function('public', 'touch_push_subscription', array['text'],
  'the one mutable column is written by a function instead');

select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'touch_push_subscription'),
  true,
  'which is definer, and filters on auth.uid() so it can only touch the '
  'caller''s own device'
);

select * from finish();
rollback;
