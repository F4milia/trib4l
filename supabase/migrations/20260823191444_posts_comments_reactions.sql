-- Reverse: drop trigger reactions_set_org_and_cohort, drop function
-- set_reaction_org_and_cohort, drop table reactions; drop trigger
-- comments_set_org_and_cohort, drop function set_comment_org_and_cohort,
-- drop table comments; drop trigger posts_cohort_matches_org, drop
-- function check_post_cohort_matches_org, drop table posts.

-- cohort_id nullable = org-wide post. Not nullable = visible only to that
-- cohort -- this is the "a member sees org-wide content plus their own
-- cohort's, nothing from sibling cohorts" line from the Session 5 plan
-- text finally having something to apply to.
create table posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  cohort_id uuid references cohorts (id) on delete cascade,
  author_profile_id uuid not null references profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger posts_set_updated_at
  before update on posts
  for each row execute function set_updated_at();

-- The plan calls this out by name: "Index (org_id, cohort_id, created_at)
-- now -- this is where the first performance wall appears." The feed query
-- is exactly this shape: give me this org's org-wide posts plus this one
-- cohort's posts, newest first.
create index posts_org_cohort_created_idx on posts (org_id, cohort_id, created_at desc);

-- Same mismatch risk as Session 5's cohort_members trigger: a post's
-- cohort_id must belong to the same org as the post itself, and a plain
-- CHECK can't express a foreign-key hop.
create or replace function check_post_cohort_matches_org()
returns trigger
language plpgsql
as $$
begin
  if new.cohort_id is not null and not exists (
    select 1 from cohorts where id = new.cohort_id and org_id = new.org_id
  ) then
    raise exception 'posts.cohort_id must belong to the same org as posts.org_id';
  end if;
  return new;
end;
$$;

create trigger posts_cohort_matches_org
  before insert or update on posts
  for each row execute function check_post_cohort_matches_org();

-- org_id/cohort_id are NOT supplied by the client -- a BEFORE INSERT
-- trigger derives them from the parent post, so there's no way for a
-- comment to end up mismatched with its post's org/cohort at all (a
-- stronger guarantee than Session 5's "reject the mismatch," which still
-- required the client to get it right in the first place).
create table comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  cohort_id uuid references cohorts (id) on delete cascade,
  post_id uuid not null references posts (id) on delete cascade,
  author_profile_id uuid not null references profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger comments_set_updated_at
  before update on comments
  for each row execute function set_updated_at();

create index comments_post_id_idx on comments (post_id, created_at);

create or replace function set_comment_org_and_cohort()
returns trigger
language plpgsql
as $$
begin
  select org_id, cohort_id into new.org_id, new.cohort_id
  from posts where id = new.post_id;

  if new.org_id is null then
    raise exception 'Referenced post not found';
  end if;

  return new;
end;
$$;

create trigger comments_set_org_and_cohort
  before insert on comments
  for each row execute function set_comment_org_and_cohort();

-- Reactions are the one exception to "soft delete everything" in this
-- codebase: a like/unlike toggle isn't user-generated content with a
-- retention story, it's an ephemeral preference -- see
-- docs/data-retention-policy.md's categories, none of which fit this.
-- Hard-deletable, no deleted_at.
create table reactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  cohort_id uuid references cohorts (id) on delete cascade,
  post_id uuid references posts (id) on delete cascade,
  comment_id uuid references comments (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  reaction_type text not null default 'like',
  created_at timestamptz not null default now(),
  constraint reactions_exactly_one_target check ((post_id is null) <> (comment_id is null))
);

create unique index reactions_unique_post_idx
  on reactions (profile_id, post_id, reaction_type) where post_id is not null;
create unique index reactions_unique_comment_idx
  on reactions (profile_id, comment_id, reaction_type) where comment_id is not null;

create or replace function set_reaction_org_and_cohort()
returns trigger
language plpgsql
as $$
begin
  if new.post_id is not null then
    select org_id, cohort_id into new.org_id, new.cohort_id from posts where id = new.post_id;
  else
    select org_id, cohort_id into new.org_id, new.cohort_id from comments where id = new.comment_id;
  end if;

  if new.org_id is null then
    raise exception 'Referenced post or comment not found';
  end if;

  return new;
end;
$$;

create trigger reactions_set_org_and_cohort
  before insert on reactions
  for each row execute function set_reaction_org_and_cohort();
