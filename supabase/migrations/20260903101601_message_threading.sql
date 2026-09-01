-- Reverse: drop trigger messages_parent_in_same_conversation on messages;
--          drop function public.check_message_parent_matches_conversation();
--          alter table messages drop column parent_message_id.

-- C2 PR 2, commit 1. Threading.
--
-- One column and one trigger, reusing C1's child-matches-parent shape. The
-- trigger is the point: a self-referencing FK guarantees the parent EXISTS, and
-- says nothing about which conversation it is in. Without this a reply could
-- point at a message in another Family's room -- a cross-Family read through a
-- column rather than through a policy, which is the shape RLS cannot see.
--
-- BEFORE, not AFTER, so the row never lands. And it raises rather than nulling
-- the column, because silently dropping a caller's parent_message_id turns a
-- rejected write into a reply that quietly became a top-level message.

alter table messages
  add column parent_message_id uuid references messages (id) on delete set null;

comment on column messages.parent_message_id is
  'The message this one replies to. ON DELETE SET NULL: deleting a parent must '
  'not cascade away every reply -- C1 soft-deletes messages so replies do not '
  'dangle, and a hard cascade here would defeat that.';

create index messages_parent_message_id_idx
  on messages (parent_message_id)
  where parent_message_id is not null;

create or replace function public.check_message_parent_matches_conversation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  parent_conversation uuid;
begin
  if new.parent_message_id is null then
    return new;
  end if;

  select m.conversation_id into parent_conversation
    from public.messages m
   where m.id = new.parent_message_id;

  if parent_conversation is null then
    raise exception 'parent message % does not exist', new.parent_message_id
      using errcode = 'foreign_key_violation';
  end if;

  if parent_conversation <> new.conversation_id then
    raise exception
      'a reply must stay in its parent conversation (parent is in %, reply in %)',
      parent_conversation, new.conversation_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.check_message_parent_matches_conversation() from public;
grant execute on function public.check_message_parent_matches_conversation()
  to authenticated, service_role;

create trigger messages_parent_in_same_conversation
  before insert or update of parent_message_id on messages
  for each row execute function public.check_message_parent_matches_conversation();
