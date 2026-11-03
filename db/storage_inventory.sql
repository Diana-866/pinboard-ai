-- Read-only inventory of PinPosy generated images in Supabase Storage.
-- Run in the Supabase SQL Editor with a role allowed to read storage.objects.
-- This query does not expose object names, paths, URLs, or user data.
-- It reports only aggregate size/count/date data for the application bucket.

select
  bucket_id,
  count(*) as object_count,
  coalesce(
    sum(
      case
        when coalesce(metadata ->> 'size', '') ~ '^[0-9]+$'
          then (metadata ->> 'size')::bigint
        else 0
      end
    ),
    0
  ) as total_bytes,
  min(created_at) as oldest_object_at,
  max(created_at) as newest_object_at
from storage.objects
where bucket_id = 'pin-images'
group by bucket_id;
