-- Reverse: drop function public.touch_push_subscription(text);
--          drop function public.delete_push_subscription(text);
--          drop table push_subscriptions.

-- Stream A unblocking, PR 10. The table N1 (Wave 4) writes to when a member
-- allows notifications, built ahead of the wave so N1 arrives to plumbing that
-- already exists and keys that only James can supply.
--
-- KEYED ON membership_id, NOT profile_id. C1's convention, and it is what makes
-- invariant 3's "notification preferences are per-Family, never one global
-- mute" expressible: a member of two Families has two subscriptions and can
-- silence one without silencing the other. A profile_id key would make that a
-- second lookup on every send, and the lookup nobody remembers.
--
-- NO UPDATE GRANT. RLS cannot restrict WHICH columns an UPDATE writes, so
-- "only your own row" on a table like this also means "you may edit any column
-- of your own row" -- including membership_id, which would redirect someone
-- else's notifications to your device. C1 PR4's lesson. The one mutable
-- column, last_seen_at, is written by a definer function that touches nothing
-- else.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  membership_id uuid not null references memberships (id) on delete cascade,

  -- The push service's own URL for this device. Unique globally, not per
  -- member: the same browser profile re-subscribing must replace its row
  -- rather than accumulate one per Family, or a member in two Families gets
  -- every notification twice on one device.
  endpoint text not null unique,

  -- The two keys the Web Push encryption requires. They are per-subscription
  -- and public in the sense that they encrypt TO this device -- but they are
  -- still not readable by anyone else, because a subscription is a capability
  -- to send someone a notification.
  p256dh text not null,
  auth text not null,

  -- Set when a send fails permanently (410 Gone), so N1 can stop trying
  -- without deleting a row a member might be about to re-authorise.
  expired_at timestamptz,

  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  unique (id, org_id)
);

create index push_subscriptions_membership_idx
  on push_subscriptions (membership_id)
  where expired_at is null;

alter table push_subscriptions enable row level security;

create policy push_subscriptions_select on push_subscriptions
  for select to authenticated
  using (
    membership_id in (
      select m.id from memberships m
       where m.profile_id = auth.uid() and m.deleted_at is null
    )
  );

create policy push_subscriptions_insert on push_subscriptions
  for insert to authenticated
  with check (
    membership_id in (
      select m.id from memberships m
       where m.profile_id = auth.uid()
         and m.deleted_at is null
         and m.org_id = push_subscriptions.org_id
    )
  );

-- Revoking notifications on this device is a real delete: there is nothing to
-- preserve, and a soft-deleted subscription would still have to be filtered out
-- of every send.
create policy push_subscriptions_delete on push_subscriptions
  for delete to authenticated
  using (
    membership_id in (
      select m.id from memberships m
       where m.profile_id = auth.uid() and m.deleted_at is null
    )
  );

grant select, insert, delete on push_subscriptions to authenticated;

create trigger push_subscriptions_audit
  after insert or update or delete on push_subscriptions
  for each row execute function public.audit_row_change('row');

-- The single mutable column, written by a function rather than by an UPDATE
-- grant. Filtered on auth.uid() so a caller can only touch their own device.
create or replace function public.touch_push_subscription(check_endpoint text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  update public.push_subscriptions s
     set last_seen_at = now()
   where s.endpoint = check_endpoint
     and s.membership_id in (
       select m.id from public.memberships m
        where m.profile_id = auth.uid() and m.deleted_at is null
     );
end;
$$;

revoke execute on function public.touch_push_subscription(text) from public;
grant execute on function public.touch_push_subscription(text)
  to authenticated, service_role;

comment on table push_subscriptions is
  'One row per device per Family. Keyed on membership so a member of two '
  'Families can silence one without silencing the other -- invariant 3''s '
  '"per-Family, never one global mute", expressed in the schema rather than '
  'left to a send-time lookup.';
