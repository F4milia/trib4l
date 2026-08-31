-- Reverse: drop function public.delete_my_account().

-- S2: "Account deletion wired to the existing anonymize-vs-purge policy". The
-- policy is docs/trib4l-docs/data-retention-policy.md, and this function is
-- exactly the four steps it lists under "What a 'delete my account' request
-- actually does today" -- no more, and nothing invented.
--
-- ON MEMORIAL-LOCK. CLAUDE.md invariant 8 and S2's named edge case both say
-- "memorial-lock content persists", and memorial-lock is defined nowhere in this
-- repository or in any governing doc. James's call, 2026-09-01, carried forward
-- from S1's session record: build against the retention policy and report
-- memorial-lock as unimplemented BECAUSE UNDEFINED, rather than invent rules for
-- it. Nothing here implements it, and nothing here contradicts it: every step
-- below preserves content and severs only the link to the person, which is the
-- direction any memorial rule would want.
--
-- WHY THE auth.users ROW SURVIVES, which looks like an omission and is not.
-- profiles.id REFERENCES auth.users(id) ON DELETE CASCADE, so deleting the
-- GoTrue user would cascade-delete the profile row -- the exact row the policy
-- says must stay, because memberships, org_profiles and audit_log all hold
-- foreign keys to it. Deleting the account in GoTrue would therefore silently
-- purge what the policy preserves. The account is made unusable instead: every
-- session is revoked here, and lib/session.ts refuses a profile carrying
-- deleted_at (PR 10).
--
-- SECURITY DEFINER because the policy's steps cross tables the caller cannot
-- write through RLS: a member can update their own profiles row, but nothing
-- grants them UPDATE on their own memberships row. The definer boundary is drawn
-- around one function whose every statement is filtered on auth.uid().
--
-- The per-column audit rows come from audit_row_change() on each table, by
-- trigger, unchanged. The extra row this function writes names the EVENT --
-- "this person asked to be deleted" -- which the trigger rows cannot express:
-- they record which columns changed on three tables, not why.

create function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_profile_id uuid := auth.uid();
begin
  if v_profile_id is null then
    return false;
  end if;

  /**
   * Already gone: return false rather than scrubbing a second time. A repeat
   * request would otherwise move deleted_at forward and write a fresh set of
   * audit rows, making the record say the account was deleted twice.
   */
  if exists (
    select 1 from public.profiles
     where id = v_profile_id and deleted_at is not null
  ) then
    return false;
  end if;

  -- Step 1. display_name is NOT NULL, so it is scrubbed to the placeholder the
  -- policy names rather than nulled. timezone is left alone: it is not
  -- identifying, and clearing it would change how surviving content renders.
  update public.profiles
     set deleted_at = now(),
         display_name = 'Deleted user',
         avatar_url = null
   where id = v_profile_id;

  -- Step 2. "Every org_profiles row for that profile gets the same treatment."
  -- display_name is nullable here, so null is the honest scrub -- each surface
  -- already falls back to the profile's name.
  update public.org_profiles
     set deleted_at = now(),
         display_name = null,
         avatar_url = null
   where profile_id = v_profile_id;

  -- Step 3. Soft-deleted, never removed: the row carries role history and join
  -- order relative to other events, which audit_log entries reference.
  update public.memberships
     set deleted_at = now()
   where profile_id = v_profile_id;

  -- Step 4 is a NON-action, and the absence is the point: nothing in audit_log
  -- is edited or removed. An audit trail that can be rewritten afterwards is not
  -- an audit trail.

  /**
   * Every session ends here, in the same transaction as the anonymisation. The
   * app layer also refuses a deleted profile, but a live session that outlived
   * the deletion by even one request would be a signed-in account with no name.
   */
  delete from auth.sessions where user_id = v_profile_id;

  insert into public.audit_log (actor_profile_id, org_id, action, target_type, target_id)
  values (v_profile_id, null, 'account.deleted', 'profile', v_profile_id);

  return true;
end;
$$;

-- EXECUTE-to-PUBLIC on creation, so this revoke is the access control. anon gets
-- nothing: auth.uid() is null without a session and the function is inert, but an
-- anonymous caller has no business reaching a deletion path at all.
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
