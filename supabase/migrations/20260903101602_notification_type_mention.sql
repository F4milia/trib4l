-- Reverse: an enum value cannot be dropped. Reversing means recreating
--          notification_type without 'mention' and re-casting every column
--          that uses it -- so treat this as forward-only and plan accordingly.

-- C2 PR 2, commit 2. The 'mention' value, alone in its own migration.
--
-- WHY ALONE. Postgres will not let a new enum value be USED in the same
-- transaction that adds it ("unsafe use of new value of enum type"), and the
-- CLI runs each migration in a transaction. 20260903101603 writes a
-- notification row of this type, so the value has to be committed before that
-- migration begins. Merging these two files fails at apply time, not at review
-- time.
--
-- WHO OWNS IT. E1's migration comment reserves the extension for N1 (Wave 4),
-- but C2 needs the value a wave earlier -- its acceptance is "a mention writes
-- a notification row". C2 adds it; N1 adds none. Left ambiguous, this is how an
-- enum gets extended twice.

alter type notification_type add value if not exists 'mention';
