-- Reverse: drop trigger messages_audit on messages, drop trigger
--   messages_set_updated_at on messages, drop trigger messages_match_conversation
--   on messages, drop table messages; drop trigger
--   conversation_participants_audit on conversation_participants, drop trigger
--   conversation_participants_match_conversation on conversation_participants,
--   drop table conversation_participants; drop trigger conversations_audit on
--   conversations, drop trigger conversations_set_updated_at on conversations,
--   drop table conversations; drop function
--   public.check_conversation_child_matches_parent(); drop type conversation_kind.
--
-- C1, PR 1 of 7. Schema only. RLS is enabled here with NO policies -- which
-- denies everything to `authenticated` -- so this migration is safe on its own
-- and PR 2 adds the policies. A table with grants and no RLS would be the
-- opposite of safe, and "the policies land in the next PR" is not a state
-- worth having in main even briefly.
--
-- PARTICIPATION IS KEYED ON membership_id, NOT profile_id. This is the whole
-- isolation design and the reason the dual-Family edge case is structural
-- rather than remembered:
--
--   a profile is a person, and a person can be in Families A and B
--   a membership IS a person in ONE Family
--
-- So a participant row cannot address the wrong Family -- there is no value it
-- could hold that would let it. A profile_id key would make every read path
-- responsible for re-checking which Family it is in, and CLAUDE.md's testing
-- rules exist because that check is exactly what gets forgotten. It also joins
-- member_blocks directly, which is already keyed this way.

create type conversation_kind as enum (
  -- One per Family, created automatically (PR 3), holding everyone.
  'family_channel',
  -- 1:1 and small-group both. The run doc asks for "1:1 and small-group DMs";
  -- they differ only in how many participant rows exist, so a second enum
  -- value would encode a fact the participant count already tells us, and
  -- could disagree with it.
  'direct'
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  kind conversation_kind not null,
  -- Null for the Family channel (it is named after the Family) and for 1:1
  -- DMs (named after the other person). A small group may set one.
  title text check (title is null or (length(title) between 1 and 120)),
  created_by_membership_id uuid references memberships (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One Family channel per Family, enforced rather than intended. PR 3 creates
-- these automatically; without this constraint a retried creation, or two
-- concurrent ones, would leave a Family with two channels and no error.
create unique index conversations_one_family_channel_idx
  on conversations (org_id)
  where kind = 'family_channel' and deleted_at is null;

create index conversations_org_id_idx on conversations (org_id);

create table conversation_participants (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized from the parent, and held true by the trigger below. See the
  -- note on messages.org_id for why this is denormalized rather than joined.
  org_id uuid not null references organizations (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  membership_id uuid not null references memberships (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (conversation_id, membership_id)
);

create index conversation_participants_membership_id_idx
  on conversation_participants (membership_id);
create index conversation_participants_org_id_idx
  on conversation_participants (org_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  -- DENORMALIZED, deliberately. audit_row_change() resolves an org through
  -- one of three modes -- 'row' (the row carries org_id), 'self' (the row IS
  -- the org) or 'order' (through a parent order). A message's org is reachable
  -- only through its conversation, which would need a fourth mode, and
  -- audit_row_change() is a shared file this session's scope does not cover.
  -- Carrying org_id and holding it true with a trigger is the smaller change,
  -- and it also keeps the RLS policies in PR 2 off a join.
  org_id uuid not null references organizations (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  -- The author as a member of THIS Family. Same reasoning as participation:
  -- a profile_id here would not say which Family the message was sent in.
  author_membership_id uuid not null references memberships (id) on delete cascade,
  body text not null check (length(body) between 1 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete: a removed message stops rendering, and the audit row and the
  -- room's history stay coherent. Hard-deleting a message would leave replies
  -- (C2) pointing at nothing.
  deleted_at timestamptz
);

-- The read path is always "this conversation, newest first".
create index messages_conversation_id_created_at_idx
  on messages (conversation_id, created_at desc);
-- The blocks join in PR 2's SELECT policy filters on the author.
create index messages_author_membership_id_idx on messages (author_membership_id);
create index messages_org_id_idx on messages (org_id);

-- Denormalized org_id is a claim, and an unchecked claim is a hole: a row
-- claiming org A while its conversation belongs to org B would be visible to
-- the wrong Family under PR 2's policies, which read org_id. Same shape as
-- check_member_block_membership_match_org() from the blocks migration, and
-- like it this holds for service_role writes too, not only for the RLS path.
--
-- One function for both child tables: they make the identical claim, and two
-- copies would be two things to keep in step.
create or replace function public.check_conversation_child_matches_parent()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_conversation_org uuid;
  v_membership_org   uuid;
  v_membership_id    uuid;
  v_row              jsonb;
begin
  select c.org_id into v_conversation_org
    from public.conversations c
   where c.id = new.conversation_id;

  if v_conversation_org is null then
    raise exception 'conversation % does not exist', new.conversation_id;
  end if;

  if v_conversation_org <> new.org_id then
    raise exception
      'org_id % does not match conversation %''s org', new.org_id, new.conversation_id;
  end if;

  -- The member must belong to the same Family. Without this, a membership from
  -- another Family could be made a participant, and the whole scoping model
  -- rests on that being impossible.
  --
  -- Through to_jsonb rather than `case tg_table_name when 'messages' then
  -- new.author_membership_id else new.membership_id end`: plpgsql resolves
  -- every field reference in an expression against the actual record, not only
  -- the branch that runs, so naming both columns raises 42703 on whichever
  -- table lacks the other. That failure is indistinguishable from this
  -- function's own guards firing, which makes a test asserting "it threw" pass
  -- for the wrong reason.
  v_row := to_jsonb(new);
  v_membership_id := coalesce(
    public.audit_safe_uuid(v_row ->> 'author_membership_id'),
    public.audit_safe_uuid(v_row ->> 'membership_id')
  );

  select m.org_id into v_membership_org
    from public.memberships m
   where m.id = v_membership_id and m.deleted_at is null;

  if v_membership_org is null then
    raise exception 'membership % is not an active membership', v_membership_id;
  end if;

  if v_membership_org <> new.org_id then
    raise exception 'membership % belongs to a different Family', v_membership_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.check_conversation_child_matches_parent() from public;

create trigger conversation_participants_match_conversation
  before insert or update on conversation_participants
  for each row execute function public.check_conversation_child_matches_parent();

create trigger messages_match_conversation
  before insert or update on messages
  for each row execute function public.check_conversation_child_matches_parent();

create trigger conversations_set_updated_at
  before update on conversations
  for each row execute function set_updated_at();

create trigger messages_set_updated_at
  before update on messages
  for each row execute function set_updated_at();

-- CLAUDE.md invariant 5: a new table gets its audit trigger in the same
-- migration that creates it. All three carry their own org_id, so 'row'.
create trigger conversations_audit
  after insert or update or delete on conversations
  for each row execute function public.audit_row_change('row');

create trigger conversation_participants_audit
  after insert or update or delete on conversation_participants
  for each row execute function public.audit_row_change('row');

create trigger messages_audit
  after insert or update or delete on messages
  for each row execute function public.audit_row_change('row');

-- Enabled with no policies: denies all access to `authenticated`. PR 2 adds
-- the policies. No grants are issued here either, for the same reason.
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;
