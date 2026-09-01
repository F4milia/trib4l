-- Reverse: drop function public.retire_table_entry(uuid).

-- Schema session, PR 10. A defect schema PR 9 found, and only PR 9 could have.
--
-- THE BUG. 20260903101012 designs table_entries around a soft delete: there is
-- no DELETE policy and no DELETE grant, and the comment says "an entry is
-- soft-deleted through UPDATE, so the row survives for the Ledger, the
-- Keepsake and the memorial lock". A MEMBER CANNOT DO THAT UPDATE.
--
-- Measured as a real user with a real JWT:
--
--   update table_entries set response_text = '...'  -- UPDATE 1
--   update table_entries set deleted_at = now()     -- ERROR 42501,
--                                                   -- "new row violates row-
--                                                   -- level security policy"
--
-- Same row, same author, same session. The difference is that
-- table_entries_select is `using (deleted_at is null and ...)`, and on UPDATE
-- Postgres requires the NEW row to satisfy the policies -- so the moment
-- deleted_at stops being null the row fails its own SELECT policy and the
-- write is refused. The table was, in effect, append-and-edit-only.
--
-- WHY pgTAP DID NOT CATCH IT, and why this file is filed under PR 9: pgTAP
-- connects as `postgres` and bypasses RLS entirely. 150_table_entries.sql
-- asserts the policies EXIST with the shape they claim, and they do. Only a
-- real user with a real JWT shows that the shape does not do the job. This is
-- the exact class of defect the isolation gate exists for.
--
-- THE FIX, and why it is a function rather than a looser policy. The obvious
-- alternative -- letting an author see their own soft-deleted rows -- would
-- make deleted entries visible to their author forever and change what
-- "deleted" means on every read path. Instead this follows the pattern C1 PR4
-- already established for exactly this shape: expose ONE security definer
-- function that writes the single column and filters on auth.uid(), rather
-- than widening a policy. Read semantics are untouched.

/**
 * Retires the caller's own Table entry. Returns whether a row was changed.
 *
 * "Retire" rather than "delete": the row survives, because the Ledger, the
 * Keepsake and the memorial lock all read entries that a member has taken
 * down. The one-per-member-per-day index is partial on `deleted_at is null`,
 * so retiring an entry also frees that day to be written again -- deleting a
 * bad entry must not cost the member the day.
 *
 * SECURITY DEFINER, and the boundary is drawn around one statement whose WHERE
 * clause is the entire security model:
 *
 *   - the entry belongs to a membership held by auth.uid()
 *   - that membership is live
 *   - the author is not memorial-locked (invariant 8: a memorialised member's
 *     entries are frozen, and taking one down is an edit)
 *
 * There is no id to tamper with beyond p_entry_id, and an entry that is not
 * the caller's simply matches nothing. Returns false rather than raising for a
 * row that does not exist or is not theirs -- the two are indistinguishable
 * from outside, deliberately.
 */
create or replace function public.retire_table_entry(p_entry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.table_entries e
     set deleted_at = now()
   where e.id = p_entry_id
     and e.deleted_at is null
     and e.member_id in (
       select m.id from public.memberships m
        where m.profile_id = auth.uid()
          and m.deleted_at is null)
     and not public.membership_is_memorialized(e.member_id);

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

comment on function public.retire_table_entry(uuid) is
  'Soft-deletes the calling member''s own Table entry. Exists because the '
  'SELECT policy''s `deleted_at is null` clause makes a direct UPDATE of '
  'deleted_at fail its own WITH CHECK -- see the migration header.';

revoke execute on function public.retire_table_entry(uuid) from public;
grant execute on function public.retire_table_entry(uuid) to authenticated;
