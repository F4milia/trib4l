-- Reverse: drop index audit_log_seq_idx; alter table audit_log drop column seq.
--
-- audit_log had no reliable ordering column.
--
--   id          gen_random_uuid()  -- random; ordering by it is meaningless
--   created_at  now()              -- TRANSACTION time, so every row written
--                                     inside one transaction ties exactly
--
-- Demonstrated: two writes in one transaction produce two audit rows with
-- identical created_at. "What happened, in what order" is the question this
-- table exists to answer, and inside a transaction it could not.
--
-- Not a live bug -- nothing reads audit_log with an ORDER BY today, only
-- lib/audit.ts writing and isolation tests filtering. It becomes one the moment
-- anything shows recent activity, paginates the log, or reconstructs a sequence
-- of events: a moderation view, an admin audit screen, or the Ledger. Fixing it
-- now costs one column on a small table; fixing it later means backfilling a
-- large one and correcting whatever already read it wrongly.
--
-- created_at is deliberately left alone. Transaction time is meaningful --
-- it groups the writes that happened atomically -- and seq orders within that
-- group. The two answer different questions.
--
-- Honest limit: a sequence orders by ASSIGNMENT, not by COMMIT. Two concurrent
-- transactions can commit out of seq order (A takes 5, B takes 6, B commits
-- first). seq gives a stable total order for pagination and exact ordering
-- within a transaction; it is not a serialization order, and nothing short of
-- a serializable snapshot would be.

alter table public.audit_log
  add column seq bigint generated always as identity;

comment on column public.audit_log.seq is
  'Monotonic insert order. Use this to order audit rows, never id (random '
  'uuid) or created_at (transaction time, identical for every row written in '
  'one transaction). Orders by assignment, not commit.';

-- Ordering without an index is a sort of the whole table, and this table now
-- grows on every write to 30 tables.
create index audit_log_seq_idx on public.audit_log (seq desc);
