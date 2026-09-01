-- Reverse: drop table notifications.

-- C2 PR 2, commit 3. The table N1 inherits.
--
-- C2 builds it because C2's acceptance is "a mention writes a notification
-- row"; N1 (Wave 4) reads it and adds delivery. No session in the run doc
-- creates it, which is why it is here rather than in a wave of its own.
--
-- THE ROW CARRIES NO CONTENT, AND THAT IS THE WHOLE DESIGN. A type, a target,
-- and the ids needed to build a link. Never message text, never an entry
-- excerpt, never a display name.
--
-- Invariant 3 says outbound messages name the event and never the content,
-- because the inbox or the lock screen may be someone else's. N1 renders emails
-- and pushes FROM THIS ROW. If the text were here, the shortest path to a
-- useful notification would be to interpolate it -- so the invariant would be
-- violated by the obvious implementation rather than by a mistake. Leaving the
-- text out makes the compliant version also the easy one.
--
-- read_at LIVES ON THE ROW, deliberately, and not as a per-member high-water
-- mark. C1's message read state is a timestamp high-water, and it has a defect
-- recorded as decision 15: a row committing after the mark with an earlier
-- created_at counts as read without being seen -- because now() is transaction
-- time, not arrival time. A per-row read_at cannot have that bug.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,

  -- Keyed on membership, not profile: C1's convention, so no read path has to
  -- re-derive which Family a notification belongs to.
  membership_id uuid not null references memberships (id) on delete cascade,

  type notification_type not null,

  -- What it points at, as ids only. 'message' today; N1 and later sessions add
  -- values as they add surfaces.
  target_type text not null check (target_type in ('message')),
  target_id uuid not null,

  -- Who caused it. An id, never a name -- resolving it goes through RLS like
  -- anything else.
  actor_membership_id uuid references memberships (id) on delete set null,

  read_at timestamptz,
  created_at timestamptz not null default now(),

  unique (id, org_id)
);

create index notifications_membership_unread_idx
  on notifications (membership_id, created_at desc)
  where read_at is null;

create index notifications_target_idx on notifications (target_type, target_id);

alter table notifications enable row level security;

-- A member reads their own notifications and nothing else. There is no policy
-- for reading anyone else's, in any role, at any assurance level.
create policy notifications_select on notifications
  for select to authenticated
  using (
    membership_id in (
      select m.id from memberships m
       where m.profile_id = auth.uid()
         and m.deleted_at is null
    )
  );

-- Marking one read is the only thing a member may change, and RLS cannot
-- restrict WHICH columns an UPDATE touches -- so there is no UPDATE grant and
-- no UPDATE policy. mark_notification_read() below writes the single column.
-- Same reasoning as C1 PR4: `grant update` plus "only your own row" means "you
-- may edit any column of your own row", which here would let a member rewrite
-- target_id and point a notification at something they cannot see.
--
-- Rows are written by the trigger in 20260903101604, which runs as definer.
-- There is deliberately no INSERT policy: a member cannot manufacture a
-- notification for themselves or anyone else.

grant select on notifications to authenticated;

create trigger notifications_audit
  after insert or update or delete on notifications
  for each row execute function public.audit_row_change('row');

create or replace function public.mark_notification_read(check_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  update public.notifications n
     set read_at = now()
   where n.id = check_notification_id
     and n.read_at is null
     and n.membership_id in (
       select m.id from public.memberships m
        where m.profile_id = auth.uid()
          and m.deleted_at is null
     );
end;
$$;

revoke execute on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid)
  to authenticated, service_role;

comment on function public.mark_notification_read(uuid) is
  'The only write a member may make to notifications. Definer, filtered on '
  'auth.uid(), and touches exactly one column -- because RLS cannot restrict '
  'which columns an UPDATE writes.';
