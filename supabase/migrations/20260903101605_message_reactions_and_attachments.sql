-- Reverse: drop function public.message_reaction_counts(uuid);
--          drop table message_attachments;
--          drop table message_reactions.

-- C2 PR 2, commits 5 and 6.
--
-- ================================================================ reactions
--
-- A NEW TABLE, NOT THE LEGACY `reactions` (decision 2). Three reasons, and the
-- first is decisive rather than stylistic:
--
--   reactions_exactly_one_target is
--     check ((post_id is null) <> (comment_id is null))
--   so a message-keyed row CANNOT SATISFY IT AT ALL. "Extending" that table
--   starts by rewriting a constraint every existing row depends on.
--
--   set_reaction_org_and_cohort() derives org_id and cohort_id from the post or
--   comment parent -- which a message reaction does not have.
--
--   Its policies are created in posts_rls and then dropped and recreated in
--   content_gating behind can_see_gated_content(org_id, cohort_id,
--   required_stage_id). A Family chat reaction would be silently gated by a
--   Trib4l stage: a bug that looks like it works.
--
-- Keyed on membership_id, like everything else in C1.

create table message_reactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  message_id uuid not null references messages (id) on delete cascade,
  membership_id uuid not null references memberships (id) on delete cascade,

  -- A short label, not free text. Unbounded content here would be a second
  -- message body wearing a different name -- searchable, notifiable, and
  -- outside every rule that governs `messages`.
  emoji text not null check (length(btrim(emoji)) between 1 and 16),

  created_at timestamptz not null default now(),

  unique (message_id, membership_id, emoji)
);

create index message_reactions_message_idx on message_reactions (message_id);

alter table message_reactions enable row level security;

create policy message_reactions_select on message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from messages m
       where m.id = message_reactions.message_id
         and public.is_conversation_participant(m.conversation_id)
         and not public.viewer_blocks_membership(m.author_membership_id)
    )
    and not public.viewer_blocks_membership(message_reactions.membership_id)
  );

create policy message_reactions_insert on message_reactions
  for insert to authenticated
  with check (
    membership_id in (
      select mem.id from memberships mem
       where mem.profile_id = auth.uid() and mem.deleted_at is null
    )
    and exists (
      select 1 from messages m
       where m.id = message_reactions.message_id
         and m.org_id = message_reactions.org_id
         and public.is_conversation_participant(m.conversation_id)
    )
  );

-- Removing your own reaction is a real delete: there is nothing to preserve,
-- no Ledger consequence, and a soft-deleted reaction would still have to be
-- filtered out of every count.
create policy message_reactions_delete on message_reactions
  for delete to authenticated
  using (
    membership_id in (
      select mem.id from memberships mem
       where mem.profile_id = auth.uid() and mem.deleted_at is null
    )
  );

-- No UPDATE grant, deliberately. Changing a reaction is removing one and adding
-- another, and an UPDATE grant on a join-shaped table means "you may edit any
-- column of your own row" -- including message_id, which would move your
-- reaction onto a message you cannot see.
grant select, insert, delete on message_reactions to authenticated;

create trigger message_reactions_audit
  after insert or update or delete on message_reactions
  for each row execute function public.audit_row_change('row');

-- SECURITY INVOKER, and this is the whole point of the function existing here
-- rather than as a definer helper. A COUNT is a read path. C1 PR4's lesson:
-- unread_message_counts() as definer would have told a blocker exactly how much
-- the blocked member was posting -- invariant 6 defeated by a number rather
-- than by content. An invoker function sees only the rows the caller's policies
-- admit, so a blocked member's reactions are absent from the count as well as
-- from the list.
create or replace function public.message_reaction_counts(check_message_id uuid)
returns table (emoji text, reaction_count bigint, reacted_by_me boolean)
language sql
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select r.emoji,
         count(*) as reaction_count,
         bool_or(mem.profile_id = auth.uid()) as reacted_by_me
    from public.message_reactions r
    join public.memberships mem on mem.id = r.membership_id
   where r.message_id = check_message_id
   group by r.emoji
   order by r.emoji;
$$;

revoke execute on function public.message_reaction_counts(uuid) from public;
grant execute on function public.message_reaction_counts(uuid)
  to authenticated, service_role;

-- ============================================================== attachments
--
-- METADATA ONLY. The bucket and its policies arrive in PR 3, and this table
-- ships with RLS ENABLED AND NO POLICIES -- which denies everything, to every
-- role, in both directions. That is the same shape C1 #67 used deliberately.
--
-- The alternative, shipping permissive policies now and tightening them in
-- PR 3, means that between the two merges the table is readable by anyone who
-- can reach it. A table that denies everything is obviously incomplete; a table
-- that allows too much looks finished.

create table message_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  message_id uuid not null references messages (id) on delete cascade,

  -- The object's path inside the bucket. PR 3 owns the bucket, the quota, and
  -- the per-file cap; this column is only the pointer.
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),

  created_at timestamptz not null default now()
);

create index message_attachments_message_idx on message_attachments (message_id);
create index message_attachments_org_idx on message_attachments (org_id);

alter table message_attachments enable row level security;

comment on table message_attachments is
  'RLS enabled with NO POLICIES on purpose: this denies everything until C2 '
  'PR 3 adds the bucket and its policies together. A table that denies '
  'everything is visibly unfinished; one that allows too much looks done.';

create trigger message_attachments_audit
  after insert or update or delete on message_attachments
  for each row execute function public.audit_row_change('row');
