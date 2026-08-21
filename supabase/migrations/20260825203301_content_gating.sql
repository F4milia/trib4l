-- Reverse: recreate the six posts/comments/reactions policies dropped
-- below exactly as they were in migration 20260823191544_posts_rls.sql
-- (drop the versions this migration creates first); drop function
-- can_see_gated_content; recreate
-- set_comment_org_and_cohort/set_reaction_org_and_cohort exactly as they
-- were in migration 20260823191444 (without copying required_stage_id);
-- drop trigger posts_stage_matches_org, drop function
-- check_post_stage_matches_org; drop column posts.required_stage_id.

alter table posts add column required_stage_id uuid references stages (id);

-- Added before the trigger functions below reference them, even though
-- PL/pgSQL doesn't strictly validate column references until first
-- execution -- ordering it this way is correct regardless of that.
alter table comments add column required_stage_id uuid references stages (id);
alter table reactions add column required_stage_id uuid references stages (id);

create or replace function check_post_stage_matches_org()
returns trigger
language plpgsql
as $$
begin
  if new.required_stage_id is not null and not exists (
    select 1 from stages where id = new.required_stage_id and org_id = new.org_id
  ) then
    raise exception 'posts.required_stage_id must belong to the same org as posts.org_id';
  end if;
  return new;
end;
$$;

create trigger posts_stage_matches_org
  before insert or update on posts
  for each row execute function check_post_stage_matches_org();

-- comments/reactions already inherit cohort_id from their parent
-- (Session 6) so a comment can never be visible in a cohort its post
-- isn't. required_stage_id needs the same treatment, or someone below the
-- gate could still comment on or react to a post they can't technically
-- see via posts_select -- extending, not replacing, the existing triggers.
create or replace function set_comment_org_and_cohort()
returns trigger
language plpgsql
as $$
begin
  select org_id, cohort_id, required_stage_id
    into new.org_id, new.cohort_id, new.required_stage_id
  from posts where id = new.post_id;

  if new.org_id is null then
    raise exception 'Referenced post not found';
  end if;

  return new;
end;
$$;

create or replace function set_reaction_org_and_cohort()
returns trigger
language plpgsql
as $$
begin
  if new.post_id is not null then
    select org_id, cohort_id, required_stage_id
      into new.org_id, new.cohort_id, new.required_stage_id
    from posts where id = new.post_id;
  else
    select org_id, cohort_id, required_stage_id
      into new.org_id, new.cohort_id, new.required_stage_id
    from comments where id = new.comment_id;
  end if;

  if new.org_id is null then
    raise exception 'Referenced post or comment not found';
  end if;

  return new;
end;
$$;

-- can_see_org_cohort_content's staff bypass (Session 6) only covers cohort
-- scoping. ANDing is_at_or_past_stage(...) on top of it, unconditionally,
-- would re-impose the stage gate on organizers/org_owner/platform_admin
-- too -- exactly the people the bypass exists to exempt. This wraps the
-- same bypass around cohort AND stage together, once, so staff clear both
-- the same way they already clear cohort scoping.
create or replace function can_see_gated_content(
  check_org_id uuid,
  check_cohort_id uuid,
  check_required_stage_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    is_platform_admin()
    or has_org_role(check_org_id, array['organizer', 'org_owner']::membership_role[])
    or (
      is_org_member(check_org_id)
      and (check_cohort_id is null or is_in_cohort(check_cohort_id))
      and is_at_or_past_stage(check_org_id, check_required_stage_id)
    );
$$;

-- ===== posts: re-scope select/insert to also require the stage gate =====

drop policy posts_select on posts;
create policy posts_select on posts
  for select to authenticated
  using (can_see_gated_content(org_id, cohort_id, required_stage_id));

drop policy posts_insert on posts;
create policy posts_insert on posts
  for insert to authenticated
  with check (
    author_profile_id = auth.uid()
    and can_see_gated_content(org_id, cohort_id, required_stage_id)
  );

-- ===== comments: same, using their trigger-derived required_stage_id =====

drop policy comments_select on comments;
create policy comments_select on comments
  for select to authenticated
  using (can_see_gated_content(org_id, cohort_id, required_stage_id));

drop policy comments_insert on comments;
create policy comments_insert on comments
  for insert to authenticated
  with check (
    author_profile_id = auth.uid()
    and can_see_gated_content(org_id, cohort_id, required_stage_id)
  );

-- ===== reactions: same =====

drop policy reactions_select on reactions;
create policy reactions_select on reactions
  for select to authenticated
  using (can_see_gated_content(org_id, cohort_id, required_stage_id));

drop policy reactions_insert on reactions;
create policy reactions_insert on reactions
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and can_see_gated_content(org_id, cohort_id, required_stage_id)
  );
