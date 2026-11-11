-- 148_account_deletion_storage_object_path_length.sql
-- Match the manifest constraint to uploadManagedPinImageObjectPath(): ordinary
-- uploads append 32 cryptographically random hex characters after the timestamp.
begin;

alter table public.account_deletion_storage_objects
  drop constraint if exists account_deletion_storage_objects_object_path_check;

alter table public.account_deletion_storage_objects
  add constraint account_deletion_storage_objects_object_path_check
  check (
    object_path ~* '^pins/(?:[0-9]+-[a-z0-9]{1,32}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp|gif)$'
  );

commit;
