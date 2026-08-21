-- Reverse: drop index comments_search_vector_idx, drop column
-- comments.search_vector; drop index posts_search_vector_idx, drop column
-- posts.search_vector.

-- GENERATED ... STORED means Postgres maintains this automatically on
-- every insert/update -- no trigger needed, and it's indexable like any
-- other column. Search goes through the exact same RLS policies as the
-- feed (supabase-js's .textSearch() is just another WHERE clause), so a
-- search result can never surface a cohort-scoped post to someone outside
-- that cohort -- the plan's org/cohort scoping requirement falls out of
-- reusing Session 6's policies rather than needing separate ones.
alter table posts add column search_vector tsvector
  generated always as (to_tsvector('english', body)) stored;

create index posts_search_vector_idx on posts using gin (search_vector);

alter table comments add column search_vector tsvector
  generated always as (to_tsvector('english', body)) stored;

create index comments_search_vector_idx on comments using gin (search_vector);
