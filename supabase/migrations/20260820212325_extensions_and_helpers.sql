-- Reverse: drop function set_updated_at, drop function is_valid_iana_timezone.
-- pgcrypto is left in place on rollback since other extensions may depend on it.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Rejects anything that isn't a real IANA zone name. Checked against
-- pg_timezone_names specifically (not "at time zone", which also accepts raw
-- UTC offsets like '+02:00') so offset strings fail this check, per the
-- plan's "never offsets" rule. Tracks tzdata updates automatically.
create or replace function is_valid_iana_timezone(tz text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from pg_timezone_names where name = tz);
$$;
