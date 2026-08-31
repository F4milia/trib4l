-- Reverse: drop function public.revoke_my_session(uuid), drop function
-- public.my_sessions().

-- S2 needs an active-sessions list and a sign-out-everywhere. Neither is
-- reachable from the client SDK: supabase-js can revoke the CALLER's sessions
-- (signOut with scope global or others) but cannot enumerate them, and
-- auth.sessions is not exposed through the Data API at all.
--
-- So these two functions, and they are the whole API. SECURITY DEFINER because
-- `authenticated` has no privilege on the auth schema -- deliberately, and this
-- does not change that: the definer boundary is drawn around one query whose
-- WHERE clause is `user_id = auth.uid()`. That predicate is the entire security
-- model here. There is no id to tamper with in a form, no org to scope, and no
-- policy to write, because a caller can only ever name their own rows.
--
-- WHAT REVOCATION ACTUALLY DOES, measured 2026-09-01 against this stack rather
-- than assumed, because the S2 edge case turns on it:
--
--   * GET /auth/v1/user with the revoked-but-unexpired access token -> 403
--     `session_not_found`. proxy.ts and lib/session.ts both call getUser() on
--     every request, so a revoked device is turned away the next time it loads
--     anything. That is the edge case, and it holds.
--   * GET /rest/v1/... with the SAME token -> still 200. PostgREST verifies the
--     signature and expiry, not whether the session still exists, so somebody
--     holding the raw access token keeps Data API access until it expires
--     (jwt_expiry, currently 3600s).
--
-- The second point is a real limit, not a bug to fix here: shortening the
-- window means lowering jwt_expiry, which affects every request in the product
-- and is not this migration's call. The UI copy is written so it does not
-- promise more than this delivers.

/**
 * The caller's own sessions, newest activity first.
 *
 * `is_current` comes from the JWT's own session_id claim, so the row for the
 * device asking is marked without the app having to guess from an IP or a user
 * agent -- both of which can be identical across two real devices.
 *
 * refreshed_at is `timestamp WITHOUT time zone` in GoTrue's schema, holding UTC.
 * `at time zone 'UTC'` converts it rather than reinterpreting it: a plain
 * ::timestamptz cast would read it as whatever the server's TimeZone happens to
 * be and silently shift every timestamp shown to the member.
 */
create function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip inet,
  aal text,
  is_current boolean
)
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select s.id,
         s.created_at,
         s.refreshed_at at time zone 'UTC',
         s.user_agent,
         s.ip,
         s.aal::text,
         s.id::text = (auth.jwt() ->> 'session_id')
    from auth.sessions s
   where s.user_id = auth.uid()
   order by s.refreshed_at desc nulls last, s.created_at desc;
$$;

/**
 * Revokes one of the caller's own sessions. Returns whether a row was removed,
 * so the caller can tell "revoked" from "already gone" without a second query.
 *
 * `user_id = auth.uid()` is the authorisation boundary. A caller naming somebody
 * else's session id deletes nothing and is told nothing about whether that id
 * exists -- false is returned for a session that is not theirs and for one that
 * never existed, which are indistinguishable on purpose.
 *
 * Deleting the row is how GoTrue's own logout works; auth.refresh_tokens and
 * auth.mfa_amr_claims both cascade from it, so no refresh token survives to mint
 * a new access token.
 */
create function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  delete from auth.sessions
   where id = p_session_id
     and user_id = auth.uid();

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- Functions are EXECUTE-to-PUBLIC on creation, so these revokes are the access
-- control. `anon` gets nothing: with no session auth.uid() is null and both
-- functions are inert anyway, but an anonymous caller has no business reaching
-- into the auth schema even to be told "no rows".
revoke all on function public.my_sessions() from public;
revoke all on function public.revoke_my_session(uuid) from public;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
