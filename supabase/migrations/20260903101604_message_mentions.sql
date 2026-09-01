-- Reverse: drop trigger message_mentions_notify on message_mentions;
--          drop function public.notify_mentioned_member();
--          drop table message_mentions.

-- C2 PR 2, commit 4. Mentions, and the session's named edge case:
--
--   B @mentions A after A blocked B -- no notification reaches A; the room is
--   unaffected.
--
-- THE BLOCK IS APPLIED AT WRITE TIME, NOT AT READ TIME. The mention row is
-- still created -- the message genuinely contains the mention, and the room is
-- "unaffected" precisely because nothing about the message changes. What does
-- not happen is the notification.
--
-- Filtering at read time instead would mean every consumer of notifications had
-- to re-check blocks to be correct, and N1 turns these rows into emails and
-- pushes. A blocked member's name arriving in A's inbox is not recoverable by
-- filtering it out of a list afterwards. Invariant 6 says a blocked member's
-- content is hidden from the blocker specifically, and an email has already
-- left the building.
--
-- DIRECTION MATTERS AND IS EASY TO GET BACKWARDS. The block that suppresses is
-- A-blocks-B, where A is the MENTIONED member and B is the message's author.
-- B blocking A does not stop A from being notified: B chose not to see A, which
-- says nothing about what A may receive.
--
-- viewer_blocks_membership() is not usable here. It resolves the viewer from
-- auth.uid(), and this trigger asks about a block between two arbitrary
-- memberships while running as the author.

create table message_mentions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  message_id uuid not null references messages (id) on delete cascade,
  mentioned_membership_id uuid not null references memberships (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- One mention of one person per message. Saying a name twice is not two
  -- mentions, and without this a client retry doubles the notifications.
  unique (message_id, mentioned_membership_id)
);

create index message_mentions_mentioned_idx
  on message_mentions (mentioned_membership_id, created_at desc);
create index message_mentions_message_idx on message_mentions (message_id);

alter table message_mentions enable row level security;

-- Visible to whoever can see the message it belongs to. Delegating to the
-- message's own policy rather than restating it means the block filter and the
-- participant check cannot drift from messages_select.
create policy message_mentions_select on message_mentions
  for select to authenticated
  using (
    exists (
      select 1 from messages m
       where m.id = message_mentions.message_id
         and public.is_conversation_participant(m.conversation_id)
         and not public.viewer_blocks_membership(m.author_membership_id)
    )
  );

-- Only the message's own author may attach mentions to it, and only in a
-- conversation they participate in.
create policy message_mentions_insert on message_mentions
  for insert to authenticated
  with check (
    exists (
      select 1 from messages m
       join memberships mem on mem.id = m.author_membership_id
       where m.id = message_mentions.message_id
         and m.org_id = message_mentions.org_id
         and mem.profile_id = auth.uid()
         and mem.deleted_at is null
         and public.is_conversation_participant(m.conversation_id)
    )
  );

grant select, insert on message_mentions to authenticated;

create trigger message_mentions_audit
  after insert or update or delete on message_mentions
  for each row execute function public.audit_row_change('row');

create or replace function public.notify_mentioned_member()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  author_membership uuid;
  message_org uuid;
begin
  select m.author_membership_id, m.org_id
    into author_membership, message_org
    from public.messages m
   where m.id = new.message_id;

  -- The mention row must belong to the same Family as its message. The FK
  -- chain does not enforce this on its own: org_id is a column on this table,
  -- so a caller could set it to a Family they are in while pointing at a
  -- message in another.
  if message_org is distinct from new.org_id then
    raise exception 'mention org % does not match message org %',
      new.org_id, message_org
      using errcode = 'check_violation';
  end if;

  -- Mentioning yourself is not news.
  if author_membership = new.mentioned_membership_id then
    return new;
  end if;

  -- THE NAMED EDGE CASE. A blocks B, B mentions A: the mention row above
  -- stands, and no notification is created.
  if exists (
    select 1
      from public.member_blocks mb
     where mb.org_id = new.org_id
       and mb.blocker_membership_id = new.mentioned_membership_id
       and mb.blocked_membership_id = author_membership
  ) then
    return new;
  end if;

  insert into public.notifications
    (org_id, membership_id, type, target_type, target_id, actor_membership_id)
  values
    (new.org_id, new.mentioned_membership_id, 'mention', 'message',
     new.message_id, author_membership);

  return new;
end;
$$;

revoke execute on function public.notify_mentioned_member() from public;
grant execute on function public.notify_mentioned_member() to authenticated, service_role;

create trigger message_mentions_notify
  after insert on message_mentions
  for each row execute function public.notify_mentioned_member();
