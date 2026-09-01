-- Reverse: drop function public.mark_conversation_read(uuid); drop function
--   public.unread_message_counts(); drop index
--   conversation_participants_last_read_idx; alter table
--   conversation_participants drop column last_read_at.
--
-- C1, PR 4 of 7. Unread counts and read receipts.
--
-- ONE COLUMN, NOT A TABLE. "Which messages has this person read" is answered
-- by a single high-water mark per participant: everything after last_read_at
-- is unread. A per-message read table would be one row per member per message
-- -- on the highest-write table in the product -- to answer a question nobody
-- asks. Read receipts here mean "how far has each participant got", which is
-- what the participant list already knows how to show.

alter table conversation_participants
  add column last_read_at timestamptz;

comment on column conversation_participants.last_read_at is
  'High-water mark: messages created after this are unread for this participant. '
  'Null means nothing has been read yet, which is the correct starting state -- '
  'defaulting to now() would silently mark the room read before it was opened.';

-- KNOWN LIMITATION, stated rather than discovered later. This is a timestamp
-- high-water mark, so a message whose created_at is earlier than the mark but
-- whose transaction COMMITS after it is counted as read without ever having
-- been seen. now() is transaction time, so the window is the length of the
-- writing transaction -- small, and it takes two concurrent writers to open it
-- at all. The same class as the audit_log seq/commit-order entry in CLAUDE.md.
--
-- Not fixed here because the fix is a different design (mark by last-seen
-- message id, ordered by a monotonic sequence) and C1's scope is "unread
-- counts", not exactly-once read tracking. If unread counts are ever load-
-- bearing for notifications -- N1 in Wave 4 is the candidate -- this is the
-- thing to revisit first.

-- The unread query filters on it per conversation.
create index conversation_participants_last_read_idx
  on conversation_participants (membership_id, last_read_at);

-- SECURITY INVOKER, deliberately and importantly: RLS on `messages` therefore
-- applies to this count exactly as it applies to a direct read. That means the
-- block filter from PR 2 is inherited for free -- a blocked author's messages
-- are not merely hidden from the room, they do not inflate the unread badge
-- either. A definer function here would have counted messages the member is
-- not allowed to see, and the badge would be the leak: a number that says
-- "three new messages" when only two are visible tells the blocker exactly how
-- much the blocked member is saying.
create or replace function public.unread_message_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql
security invoker
stable
set search_path = pg_catalog, pg_temp
as $$
  select m.conversation_id, count(*)
    from public.messages m
    join public.conversation_participants cp
      on cp.conversation_id = m.conversation_id
    join public.memberships mem
      on mem.id = cp.membership_id
   where mem.profile_id = auth.uid()
     and mem.deleted_at is null
     and m.deleted_at is null
     -- Your own messages are never unread to you.
     and m.author_membership_id <> cp.membership_id
     and (cp.last_read_at is null or m.created_at > cp.last_read_at)
   group by m.conversation_id;
$$;

-- SECURITY DEFINER, and the reason is a hole rather than a convenience.
--
-- The obvious implementation is `grant update on conversation_participants to
-- authenticated` plus a policy restricting it to your own row. RLS cannot
-- restrict WHICH COLUMNS an update touches, so that grant would let a member
-- update their own participant row's conversation_id -- moving themselves into
-- a DM they are not part of, inside their own Family, where PR 1's
-- child-matches-parent trigger sees nothing wrong because the org still
-- matches. The policy would read as "you may only edit your own row" and mean
-- "you may join any room in your Family".
--
-- So no UPDATE grant is issued at all, and the only way to move the mark is
-- this function, which touches one column and filters on auth.uid().
create or replace function public.mark_conversation_read(check_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  -- Membership in the room is required, and is checked against the CALLER, so
  -- a definer function cannot be used to mark someone else's room read.
  if not public.is_conversation_participant(check_conversation_id) then
    return null;
  end if;

  update public.conversation_participants cp
     set last_read_at = v_now
    from public.memberships m
   where cp.conversation_id = check_conversation_id
     and m.id = cp.membership_id
     and m.profile_id = auth.uid()
     and m.deleted_at is null
     -- Never move the mark BACKWARDS. Two devices reading the same room race,
     -- and the older one's now() must not un-read what the newer one read.
     and (cp.last_read_at is null or cp.last_read_at < v_now);

  return v_now;
end;
$$;

revoke execute on function public.unread_message_counts() from public;
revoke execute on function public.mark_conversation_read(uuid) from public;

grant execute on function public.unread_message_counts() to authenticated, service_role;
grant execute on function public.mark_conversation_read(uuid) to authenticated, service_role;
