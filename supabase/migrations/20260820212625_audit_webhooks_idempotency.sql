-- Reverse: drop table idempotency_keys, drop table webhook_events, drop
-- table audit_log.

-- Append-only by convention (no deleted_at, no updated_at/update trigger):
-- an audit trail that can be edited after the fact isn't an audit trail.
-- org_id is nullable because platform_admin actions (e.g. cross-org reads)
-- aren't scoped to a single org.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles (id) on delete set null,
  org_id uuid references organizations (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_org_id_created_at_idx on audit_log (org_id, created_at);
create index audit_log_actor_profile_id_idx on audit_log (actor_profile_id);

-- Dedup key for every provider webhook (Stripe, Mux, ...) regardless of
-- which session wires up the first one. Insert-before-process: the handler
-- inserts here first and only proceeds if that insert didn't hit the
-- unique constraint, so a redelivered event is a no-op rather than a
-- duplicate side effect.
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

-- Client-supplied idempotency keys for user-initiated writes that cost
-- money or create records (checkout, video upload, ...). Same insert-
-- before-process pattern as webhook_events: a double-tapped submit with the
-- same key on bad signal replays the stored response instead of repeating
-- the write.
create table idempotency_keys (
  key text primary key,
  profile_id uuid references profiles (id) on delete set null,
  request_fingerprint text not null,
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
