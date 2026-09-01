-- Reverse: drop policies + revoke grants on messages, conversation_participants
--   and conversations (children before parents); drop function
--   public.viewer_blocks_membership(uuid); drop function
--   public.is_conversation_creator(uuid); drop function
--   public.is_conversation_participant(uuid).
--
-- C1, PR 2 of 7. The session's actual acceptance criteria live here.
--
-- SCOPED TO PARTICIPANTS, NOT TO THE FAMILY. The run doc is explicit about
-- this and it is the whole point: being in Family A does not entitle you to
-- read a DM between two other members of Family A. Every policy below asks
-- "are you in this conversation", never "are you in this Family".
--
-- SECURITY DEFINER on the three helpers, for the same reason
-- is_org_member() is: a policy on conversation_participants that queries
-- conversation_participants recurses into RLS forever. Running as the owner
-- breaks the cycle. Each returns a boolean and never row data, so it cannot
-- be used to smuggle rows out from under a policy.
--
-- search_path is pinned as `pg_catalog, pg_temp` with every reference
-- schema-qualified, NOT as `public` -- the 2026-09-01 S2 entry: `= public`
-- leaves pg_temp implicitly FIRST, so a caller-created temp table can shadow
-- a relation inside a definer function. Fifteen existing functions still carry
-- that shape and are owed a migration; C1 does not add a sixteenth.

create or replace function public.is_conversation_participant(check_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select exists (
    select 1
      from public.conversation_participants cp
      join public.memberships m on m.id = cp.membership_id
     where cp.conversation_id = check_conversation_id
       and m.profile_id = auth.uid()
       -- A member who has left the Family loses the room with it.
       and m.deleted_at is null
  );
$$;

-- Creating a conversation and joining it are two statements, and PostgREST
-- cannot wrap them in one transaction. Without this, the creator cannot read
-- back the row they just inserted -- they are not a participant yet -- and the
-- INSERT appears to fail. PR 5 replaces the two-step with an RPC; this keeps
-- the schema honest in the meantime rather than leaving a hole PR 5 has to
-- remember to close.
create or replace function public.is_conversation_creator(check_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select exists (
    select 1
      from public.conversations c
      join public.memberships m on m.id = c.created_by_membership_id
     where c.id = check_conversation_id
       and m.profile_id = auth.uid()
       and m.deleted_at is null
  );
$$;

-- CLAUDE.md invariant 6: a blocked member's content is hidden from the blocker
-- SPECIFICALLY, not deleted for the room. So this asks only "has the VIEWER
-- blocked this author" -- it is deliberately one-directional. The blocked
-- member still sees the blocker, and everyone else still sees both.
--
-- In the policy rather than in the read path, deliberately: Supabase Realtime
-- evaluates RLS per subscriber, so a block enforced here holds on the live
-- path too. A block enforced in lib/ would be bypassed by the very first
-- realtime subscription, and would look correct in every test that queried
-- through the server.
create or replace function public.viewer_blocks_membership(check_membership_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select exists (
    select 1
      from public.member_blocks b
      join public.memberships m on m.id = b.blocker_membership_id
     where m.profile_id = auth.uid()
       and b.blocked_membership_id = check_membership_id
  );
$$;

-- Revoke from PUBLIC, then grant to the roles that actually need it. The
-- revoke alone is not enough and not harmless: `authenticated` inherits from
-- PUBLIC, so revoking without re-granting makes every policy below fail with
-- "permission denied for function", which reads as a policy bug rather than a
-- grant one. anon keeps nothing -- none of this is reachable signed out.
revoke execute on function public.is_conversation_participant(uuid) from public;
revoke execute on function public.is_conversation_creator(uuid) from public;
revoke execute on function public.viewer_blocks_membership(uuid) from public;

grant execute on function public.is_conversation_participant(uuid) to authenticated, service_role;
grant execute on function public.is_conversation_creator(uuid) to authenticated, service_role;
grant execute on function public.viewer_blocks_membership(uuid) to authenticated, service_role;

-- ===== conversations =====

-- service_role bypasses RLS but NOT plain Postgres grants -- the 2026-08-29
-- lesson, which cost a session each time it was rediscovered. Granted here
-- because PR 3's channel creation and PR 5's server paths both need it.
grant select, insert, update on conversations to authenticated;
grant select, insert, update, delete on conversations to service_role;

create policy conversations_select on conversations
  for select to authenticated
  using (
    public.is_conversation_participant(id)
    or public.is_conversation_creator(id)
    or is_platform_admin()
  );

-- A member creates DMs, never the Family channel: that one is created
-- automatically per Family (PR 3) and the unique index makes a second one
-- impossible anyway. Spelling it out here means the refusal is a policy, not
-- a constraint violation surfacing as a 500.
create policy conversations_insert on conversations
  for insert to authenticated
  with check (
    kind = 'direct'
    and is_org_member(org_id)
    and exists (
      select 1 from memberships m
       where m.id = created_by_membership_id
         and m.profile_id = auth.uid()
         and m.org_id = conversations.org_id
         and m.deleted_at is null
    )
  );

-- Renaming a small group. Participants only, and platform_admin is
-- deliberately absent: there is nothing administrative about a room's title.
create policy conversations_update on conversations
  for update to authenticated
  using (public.is_conversation_participant(id))
  with check (public.is_conversation_participant(id));

-- ===== conversation_participants =====

grant select, insert, delete on conversation_participants to authenticated;
grant select, insert, update, delete on conversation_participants to service_role;

create policy conversation_participants_select on conversation_participants
  for select to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    or public.is_conversation_creator(conversation_id)
    or is_platform_admin()
  );

-- Adding someone to a room requires already being in it (or having just made
-- it). The child-matches-parent trigger from PR 1 independently guarantees the
-- membership belongs to the same Family, so this policy does not restate it --
-- that check holds for service_role writes too, which a policy cannot.
create policy conversation_participants_insert on conversation_participants
  for insert to authenticated
  with check (
    public.is_conversation_participant(conversation_id)
    or public.is_conversation_creator(conversation_id)
  );

-- Leaving is removing your own row, and only your own.
create policy conversation_participants_delete on conversation_participants
  for delete to authenticated
  using (
    exists (
      select 1 from memberships m
       where m.id = membership_id and m.profile_id = auth.uid()
    )
  );

-- ===== messages =====

grant select, insert, update on messages to authenticated;
grant select, insert, update, delete on messages to service_role;

-- The two halves of invariant 6 and the participant rule, in one policy:
-- you must be in the room, and you do not see authors you have blocked.
create policy messages_select on messages
  for select to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    and not public.viewer_blocks_membership(author_membership_id)
  );

create policy messages_insert on messages
  for insert to authenticated
  with check (
    public.is_conversation_participant(conversation_id)
    and exists (
      select 1 from memberships m
       where m.id = author_membership_id
         and m.profile_id = auth.uid()
         and m.deleted_at is null
    )
  );

-- Author only -- editing your own message, or soft-deleting it.
--
-- Deliberately NOT extended to organizer/org_owner, which is where posts_update
-- landed. A post is addressed to the Family; a DM is addressed to one person,
-- and an organizer cannot even READ it under messages_select. Granting update
-- on rows they cannot see would let staff edit the contents of private
-- conversations. If moderation of the Family channel is wanted, it belongs in
-- C2 with reporting, scoped to that conversation kind, not smuggled in here.
create policy messages_update on messages
  for update to authenticated
  using (
    exists (
      select 1 from memberships m
       where m.id = author_membership_id and m.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from memberships m
       where m.id = author_membership_id and m.profile_id = auth.uid()
    )
  );

-- No delete policy on messages: they soft-delete via deleted_at, which is an
-- update. A hard delete would strand C2's replies.
