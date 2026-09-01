-- C2 PR 2, commits 5-6. Reactions and the attachment metadata table.
--
-- The reactions assertions are mostly about what CANNOT be written, and about
-- the grant surface rather than the policy text -- because a grant is what
-- decides whether a policy is even consulted.

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

create temporary table _f as
select '00000000-0000-0000-0000-0000000c2a21'::uuid as org_id,
       '00000000-0000-0000-0000-0000000c2a22'::uuid as member_id,
       '00000000-0000-0000-0000-0000000c2a23'::uuid as profile_id,
       '00000000-0000-0000-0000-0000000c2a24'::uuid as conv_id,
       '00000000-0000-0000-0000-0000000c2a25'::uuid as msg_id;

insert into auth.users (id, email, aud, role)
select profile_id, '_c2-react@example.test', 'authenticated', 'authenticated' from _f;

insert into public.organizations (id, slug, name)
select org_id, 'c2-reactions-probe', 'Reactions Probe' from _f;

insert into public.memberships (id, org_id, profile_id, role)
select member_id, org_id, profile_id, 'org_owner'::membership_role from _f;

insert into public.conversations (id, org_id, kind, created_by_membership_id)
select conv_id, org_id, 'direct'::conversation_kind, member_id from _f;

insert into public.conversation_participants (conversation_id, org_id, membership_id)
select conv_id, org_id, member_id from _f;

insert into public.messages (id, org_id, conversation_id, author_membership_id, body)
select msg_id, org_id, conv_id, member_id, 'react to me' from _f;

-- ------------------------------------------------------------- reactions
select has_table('public', 'message_reactions', 'message_reactions exists');

select has_trigger('public', 'message_reactions', 'message_reactions_audit',
  'invariant 5: the audit trigger arrives with the table');

select lives_ok(
  $$
    insert into public.message_reactions (org_id, message_id, membership_id, emoji)
    select org_id, msg_id, member_id, '👍' from _f
  $$,
  'a member may react'
);

select throws_ok(
  $$
    insert into public.message_reactions (org_id, message_id, membership_id, emoji)
    select org_id, msg_id, member_id, '👍' from _f
  $$,
  '23505',
  null,
  'the same reaction twice is refused -- a client retry must not double a count'
);

select throws_ok(
  $$
    insert into public.message_reactions (org_id, message_id, membership_id, emoji)
    select org_id, msg_id, member_id, repeat('x', 17) from _f
  $$,
  '23514',
  null,
  'a 17-character "emoji" is refused -- unbounded text here would be a second '
  'message body outside every rule that governs messages'
);

-- RLS cannot restrict WHICH columns an UPDATE writes, so the defence against
-- "move my reaction onto a message I cannot see" is the absence of the grant,
-- not a policy. C1 PR4's lesson, applied before it can bite.
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'message_reactions'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  0,
  'authenticated has NO UPDATE grant on message_reactions -- changing a '
  'reaction is a delete and an insert'
);

-- The three it does need, asserted by presence rather than as an exact set.
--
-- An exact-set assertion fails here, and the reason is worth recording rather
-- than working around: `authenticated` also holds REFERENCES, TRIGGER and
-- TRUNCATE on this table -- and on `messages`, and on every other table in
-- public. That comes from Supabase's default privileges, is identical on the
-- shared stack and in the sandbox, and predates C2 entirely. TRUNCATE is the
-- interesting one, because TRUNCATE BYPASSES RLS; it is latent only because
-- PostgREST exposes no way to issue one. Not this PR's to fix -- reported.
select is(
  (select array_agg(distinct privilege_type::text order by privilege_type::text)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'message_reactions'
      and grantee = 'authenticated'
      and privilege_type in ('SELECT', 'INSERT', 'DELETE', 'UPDATE')),
  array['DELETE', 'INSERT', 'SELECT'],
  'and exactly the three DML privileges it does need, with UPDATE absent'
);

-- A COUNT is a read path. SECURITY INVOKER is what keeps a blocked member's
-- reactions out of the number as well as out of the list -- invariant 6 is
-- defeated by an aggregate just as easily as by content.
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'message_reaction_counts'),
  false,
  'message_reaction_counts() is SECURITY INVOKER, so it counts only rows the '
  'caller''s own policies admit'
);

-- ----------------------------------------------------------- attachments
select has_table('public', 'message_attachments', 'message_attachments exists');

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'message_attachments'),
  'RLS is enabled on message_attachments'
);

-- PR 2 shipped this table deny-all (RLS on, zero policies) so the metadata and
-- the bytes it points at became reachable in the SAME change. PR 3 closed that
-- window by adding the bucket and these policies together, so the assertion
-- moved with the design rather than being deleted.
--
-- Still no UPDATE and no DELETE policy: replacing an attachment in place would
-- move bytes without moving the row that accounts for them, and a delete
-- happens through message deletion, which removes the object too.
select is(
  (select array_agg(p.polcmd::text order by p.polcmd::text)
     from pg_policy p join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'message_attachments'),
  array['a', 'r'],
  'message_attachments has exactly an INSERT and a SELECT policy -- added by '
  'PR 3 with the bucket, and still nothing that could rewrite a row in place'
);

select has_trigger('public', 'message_attachments', 'message_attachments_audit',
  'invariant 5: the audit trigger arrives with the table, before the policies');

select * from finish();
rollback;
