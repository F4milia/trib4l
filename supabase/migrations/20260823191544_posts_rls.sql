-- Reverse: drop policies + revoke grants + disable RLS on reactions,
-- comments, posts (in that order, children before parents); drop function
-- moderate_comment; drop function moderate_post.

-- Shared visibility shape, referenced by posts/comments/reactions alike:
-- org staff and platform_admin see everything (moderation needs full
-- visibility); everyone else sees org-wide content plus their own
-- cohort's, nothing from a sibling cohort.
create or replace function can_see_org_cohort_content(check_org_id uuid, check_cohort_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_platform_admin()
    or has_org_role(check_org_id, array['organizer', 'org_owner']::membership_role[])
    or (is_org_member(check_org_id) and (check_cohort_id is null or is_in_cohort(check_cohort_id)));
$$;

-- ===== posts =====

alter table posts enable row level security;
grant select, insert, update on posts to authenticated;

create policy posts_select on posts
  for select to authenticated
  using (can_see_org_cohort_content(org_id, cohort_id));

-- Posting into a specific cohort requires being in it (or being org staff,
-- who can post an announcement into any cohort) -- same shape as the
-- select policy, plus "the post is actually yours."
create policy posts_insert on posts
  for insert to authenticated
  with check (
    author_profile_id = auth.uid()
    and (
      has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
      or is_platform_admin()
      or (is_org_member(org_id) and (cohort_id is null or is_in_cohort(cohort_id)))
    )
  );

-- Author can edit their own post; org staff/platform_admin can update any
-- post in scope (moderation -- in practice this only ever sets
-- deleted_at, enforced by convention through moderate_post() below rather
-- than by restricting which columns RLS allows, same as how
-- organizations_update doesn't column-restrict org_owner either).
create policy posts_update on posts
  for update to authenticated
  using (
    author_profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  )
  with check (
    author_profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- ===== comments =====

alter table comments enable row level security;
grant select, insert, update on comments to authenticated;

create policy comments_select on comments
  for select to authenticated
  using (can_see_org_cohort_content(org_id, cohort_id));

create policy comments_insert on comments
  for insert to authenticated
  with check (
    author_profile_id = auth.uid()
    and can_see_org_cohort_content(org_id, cohort_id)
  );

create policy comments_update on comments
  for update to authenticated
  using (
    author_profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  )
  with check (
    author_profile_id = auth.uid()
    or has_org_role(org_id, array['organizer', 'org_owner']::membership_role[])
    or is_platform_admin()
  );

-- ===== reactions =====

alter table reactions enable row level security;
grant select, insert, delete on reactions to authenticated;

create policy reactions_select on reactions
  for select to authenticated
  using (can_see_org_cohort_content(org_id, cohort_id));

create policy reactions_insert on reactions
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and can_see_org_cohort_content(org_id, cohort_id)
  );

-- Unlike is a hard delete of your own reaction only -- see the migration
-- that created this table for why reactions don't follow the soft-delete
-- convention everything else does.
create policy reactions_delete on reactions
  for delete to authenticated
  using (profile_id = auth.uid() or is_platform_admin());

-- ===== moderation, with the audit_log write the plan calls out by name =====

-- Not SECURITY DEFINER: both the UPDATE and the audit_log INSERT run under
-- the caller's own RLS (the posts_update and audit_log_insert policies
-- already allow this for organizer/org_owner/platform_admin) -- this
-- function adds atomicity (one transaction, not two round trips that could
-- partially fail), not privilege.
create or replace function moderate_post(target_post_id uuid, reason text default null)
returns posts
language plpgsql
as $$
declare
  result posts;
begin
  update posts set deleted_at = now() where id = target_post_id and deleted_at is null
  returning * into result;

  if result is null then
    raise exception 'Post not found, already removed, or not permitted';
  end if;

  insert into audit_log (actor_profile_id, org_id, action, target_type, target_id, metadata)
  values (auth.uid(), result.org_id, 'moderate_post', 'posts', result.id, jsonb_build_object('reason', reason));

  return result;
end;
$$;

grant execute on function moderate_post(uuid, text) to authenticated;

create or replace function moderate_comment(target_comment_id uuid, reason text default null)
returns comments
language plpgsql
as $$
declare
  result comments;
begin
  update comments set deleted_at = now() where id = target_comment_id and deleted_at is null
  returning * into result;

  if result is null then
    raise exception 'Comment not found, already removed, or not permitted';
  end if;

  insert into audit_log (actor_profile_id, org_id, action, target_type, target_id, metadata)
  values (auth.uid(), result.org_id, 'moderate_comment', 'comments', result.id, jsonb_build_object('reason', reason));

  return result;
end;
$$;

grant execute on function moderate_comment(uuid, text) to authenticated;
