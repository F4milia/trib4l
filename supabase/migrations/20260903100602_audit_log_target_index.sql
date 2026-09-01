-- Reverse: drop index public.audit_log_target_idx;
--
-- PERF-2, deferred from audit PR 3/5 and owed before Wave 2. audit_log is
-- indexed on (org_id, created_at), (actor_profile_id) and (seq desc). Nothing
-- covers the target, so "this record's history" -- the single most natural
-- question to ask an audit log -- scans the whole table.
--
-- Not speculative. tests/isolation already filters on target_id in
-- mentorship, posts and support-requests, because the 2026-08-29 learned
-- constraint requires every assertion to be scoped to the row the test itself
-- created. Every table C1 adds brings more of them, and audit_log is append-
-- only with no retention policy, so this only gets slower.
--
-- MEASURED, 2026-09-01, on 200k rows -- a modest few months for a chat product
-- with 30 tables feeding this table:
--
--   without  Parallel Seq Scan   2869 buffers   7.123 ms   100270 rows filtered
--   with     Index Scan             4 buffers   0.033 ms
--
-- The price is 9.2 MB per 200k rows and one more index to maintain on the
-- highest-write table in the product. Taken now, while the table is small,
-- because the alternative is building it later against live data.
--
-- (target_type, target_id) in that order: target_type is the low-cardinality
-- leading column, which keeps the index usable for "everything that happened
-- to messages" as well as for one specific row. The reverse order would serve
-- only the second.
--
-- Not CONCURRENTLY: supabase migrations run inside a transaction, which
-- forbids it, and the table is small enough today that the brief ACCESS
-- EXCLUSIVE lock is the cheaper trade. That is the whole argument for doing
-- this before Wave 2 rather than after.

create index audit_log_target_idx on public.audit_log (target_type, target_id);

comment on index public.audit_log_target_idx is
  'Serves "this record''s history" -- audit_log filtered by target. Without it '
  'that query scans a table fed by every audited write in the product.';
