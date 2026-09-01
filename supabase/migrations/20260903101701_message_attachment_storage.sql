-- Reverse: drop trigger message_attachments_delete_objects on messages;
--          drop function public.delete_message_storage_objects();
--          drop function public.check_family_storage_quota(uuid, bigint);
--          drop function public.family_storage_bytes(uuid);
--          drop function public.project_storage_bytes();
--          drop the four storage.objects policies;
--          delete from storage.buckets where id = 'family-attachments';
--          (any objects already uploaded must be removed through the storage
--          API first -- deleting the bucket row does not reclaim them.)

-- C2 PR 3. The bucket, its policies, and the two quotas.
--
-- The bucket is created HERE, by insert, not in config.toml: config.toml is not
-- applied to a hosted project, so a bucket declared there exists locally and is
-- missing in staging -- which presents as an upload failing in one environment
-- only.
--
-- ============================================ the numbers, and where they come from
--
-- These are a function of the PLAN, not of the product. Supabase Free gives
-- 1 GB of file storage across the whole project -- not per Family -- and James
-- fixed the ceiling at 8 Families (decision 12).
--
--   per file        5 MB    on a 1 GB project a 10 MB attachment is 1% of
--                           everything. 5 MB still covers a phone photo (2-5 MB)
--                           or a document. Set on the BUCKET ROW as well as in
--                           the app, so the platform refuses it too.
--   per Family    100 MB    8 x 100 MB = 800 MB of 1024 MB, leaving ~224 MB for
--                           Keepsake PDFs and slack.
--
-- THE QUOTA IS PER FAMILY ACROSS ALL ATTACHMENT BUCKETS, NOT PER FEATURE. M1
-- (Wave 5) adds photos on Table entries and attachments on Bricks "reusing
-- Wave 3's storage policy pattern, same quotas, same caps". If M1 gets its own
-- 100 MB per Family the budget doubles to 1600 MB and the 1 GB plan is blown
-- before Wave 6. family_storage_bytes() therefore sums every bucket named in
-- ATTACHMENT_BUCKETS below, and M1 adds its bucket to that list rather than
-- adding a second allowance.
--
-- ============================================ the project guard, and why it exists
--
-- A per-Family quota does not bound the project total: eight Families each
-- comfortably inside their 100 MB is exactly the whole plan. The failure that
-- creates is a Family UNDER its own quota whose upload fails anyway, with a raw
-- Supabase error rather than this session's plain message -- which breaks the
-- acceptance criterion in a way the per-Family check structurally cannot catch.
--
-- So there are two ceilings and the caller is told WHICH one it hit.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'family-attachments',
  'family-attachments',
  false,                    -- invariant 9: nothing is public by default
  5242880,                  -- 5 MB, enforced by the platform as well as by us
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'application/pdf',
    'text/plain'
  ]
)
on conflict (id) do nothing;

-- Path shape: <org_id>/<conversation_id>/<filename>
--
-- org_id leads so that every policy and every quota sum is a prefix match on
-- the first path token, and so a Family's whole footprint is one subtree.
-- storage.objects.path_tokens is maintained by the storage service and is the
-- supported way to read it.

-- SECURITY DEFINER because it reads storage.objects, which members have no
-- grant on -- and therefore it needs its own membership check, which the
-- policies on storage.objects would otherwise have provided.
--
-- A NUMBER IS A READ PATH. C1 PR4's lesson, in a second place: an unguarded
-- definer aggregate hands a member of another Family a measurement of this
-- Family's activity. Caught by the isolation test rather than by review -- the
-- first version of this function returned the true sum to anyone who asked.
create or replace function public.family_storage_bytes(check_org_id uuid)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select case
    when public.is_org_member(check_org_id) then (
      select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
        from storage.objects o
       where o.bucket_id in ('family-attachments')   -- ATTACHMENT_BUCKETS
         and o.path_tokens[1] = check_org_id::text
    )
    else 0::bigint
  end;
$$;

comment on function public.family_storage_bytes(uuid) is
  'Bytes held by one Family across ALL attachment buckets. M1 (Wave 5) adds its '
  'bucket to the IN list here rather than giving Families a second allowance -- '
  'a per-feature quota would double the budget and blow the 1 GB plan.';

-- NOT granted to authenticated: the project total is a fact about the platform,
-- not about any Family, and a member has no reason to learn how full the plan
-- is. check_family_storage_quota() calls it as definer and returns only a
-- sentence.
create or replace function public.project_storage_bytes()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id in ('family-attachments');
$$;

-- Returns null when the upload is allowed, or a PLAIN REASON when it is not.
--
-- A reason string rather than a boolean, because the acceptance criterion is
-- "quota exceeded fails with a plain message, not a broken upload" -- and the
-- two ceilings fail for different reasons that a member experiences
-- differently. "Your Family is out of space" is actionable; "the platform is
-- out of space" is not, and telling someone the first when it was the second
-- sends them deleting their own photos for nothing.
create or replace function public.check_family_storage_quota(
  check_org_id uuid,
  incoming_bytes bigint
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  per_family_limit constant bigint := 104857600;   -- 100 MB
  project_limit    constant bigint := 838860800;   -- 800 MB usable of a 1 GB plan
  family_bytes  bigint;
  project_bytes bigint;
begin
  if incoming_bytes > 5242880 then
    return 'That file is larger than the 5 MB limit.';
  end if;

  select public.family_storage_bytes(check_org_id) into family_bytes;
  if family_bytes + incoming_bytes > per_family_limit then
    return 'Your Family has used all 100 MB of its attachment space. '
           'Delete an older attachment to make room.';
  end if;

  select public.project_storage_bytes() into project_bytes;
  if project_bytes + incoming_bytes > project_limit then
    -- Deliberately distinct from the message above. This one is not the
    -- member's to fix, and telling them it is sends them deleting their own
    -- photos for nothing.
    return 'Attachments are temporarily unavailable while we add capacity.';
  end if;

  return null;
end;
$$;

revoke execute on function public.family_storage_bytes(uuid) from public;
revoke execute on function public.project_storage_bytes() from public;
revoke execute on function public.check_family_storage_quota(uuid, bigint) from public;
grant execute on function public.family_storage_bytes(uuid) to authenticated, service_role;
grant execute on function public.project_storage_bytes() to service_role;
grant execute on function public.check_family_storage_quota(uuid, bigint)
  to authenticated, service_role;

-- ===================================================================== RLS
--
-- The acceptance criterion the prompt words most strongly: "an attachment
-- uploaded to Family A's channel is unreachable by URL from a Family B session
-- -- proven, not assumed". The bucket is private, so reachability is decided
-- here and nowhere else.

create policy family_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'family-attachments'
    and public.is_conversation_participant((path_tokens[2])::uuid)
  );

create policy family_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'family-attachments'
    and public.is_conversation_participant((path_tokens[2])::uuid)
    and public.is_org_member((path_tokens[1])::uuid)
  );

-- No UPDATE policy. Replacing an attachment in place would move bytes without
-- moving the row that accounts for them, and an upsert past the size limit is
-- the obvious way around the per-file cap.
create policy family_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'family-attachments'
    and public.is_conversation_participant((path_tokens[2])::uuid)
  );

-- ============================================== deleting a message deletes the blob
--
-- Rather than deciding whether a soft-deleted message's attachment still counts
-- against the quota, make it not exist. The message ROW is soft-deleted -- C1
-- needs that so replies do not dangle -- and the object is removed, so the row
-- keeps a reference that no longer resolves. That is exactly what M1's edge
-- case asks for ("the storage object is unreachable afterward"), the quota
-- never lies, and there is no reclaim job to schedule.
--
-- WIRED TO MESSAGE DELETION ONLY, NEVER TO ACCOUNT DELETION. Invariant 8's
-- anonymise-vs-purge policy governs that path and memorial-locked content
-- persists. Different path, different rule.
--
-- HONEST LIMIT: this deletes the storage.objects ROW, which is what makes the
-- object unreachable and what the quota sums. Reclaiming the bytes in the
-- backing store is the storage service's job and cannot be done from SQL. So
-- "the quota is correct" and "the disk is free" are different claims, and only
-- the first is made here.

create or replace function public.delete_message_storage_objects()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    delete from storage.objects o
     where o.bucket_id = 'family-attachments'
       and o.name in (
         select a.storage_path from public.message_attachments a
          where a.message_id = new.id
       );
  end if;
  return new;
end;
$$;

revoke execute on function public.delete_message_storage_objects() from public;
grant execute on function public.delete_message_storage_objects()
  to authenticated, service_role;

create trigger message_attachments_delete_objects
  after update of deleted_at on messages
  for each row execute function public.delete_message_storage_objects();

-- ================================== message_attachments policies (deny-all until now)
--
-- PR 2 shipped this table RLS-enabled with no policies, deliberately, so that
-- the metadata and the bytes it points at became reachable in the same change.

create policy message_attachments_select on message_attachments
  for select to authenticated
  using (
    exists (
      select 1 from messages m
       where m.id = message_attachments.message_id
         and public.is_conversation_participant(m.conversation_id)
         and not public.viewer_blocks_membership(m.author_membership_id)
    )
  );

create policy message_attachments_insert on message_attachments
  for insert to authenticated
  with check (
    exists (
      select 1 from messages m
       join memberships mem on mem.id = m.author_membership_id
       where m.id = message_attachments.message_id
         and m.org_id = message_attachments.org_id
         and mem.profile_id = auth.uid()
         and mem.deleted_at is null
         and public.is_conversation_participant(m.conversation_id)
    )
  );

grant select, insert on message_attachments to authenticated;
