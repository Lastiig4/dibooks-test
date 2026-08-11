-- DiBooks cutscene media storage v1
-- Maakt een private Supabase Storage bucket voor cutscenes/media.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-assets',
  'book-assets',
  false,
  104857600,
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated users may read book-assets through signed URLs.
-- De reader/RPC bepaalt nog steeds of iemand een boek mag openen.
drop policy if exists "Authenticated users can read book assets" on storage.objects;
create policy "Authenticated users can read book assets"
on storage.objects
for select
to authenticated
using (bucket_id = 'book-assets');

-- Users may upload/update/delete assets only inside their own top-level folder:
-- book-assets/{auth.uid()}/...
drop policy if exists "Users can upload own book assets" on storage.objects;
create policy "Users can upload own book assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'book-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own book assets" on storage.objects;
create policy "Users can update own book assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'book-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'book-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own book assets" on storage.objects;
create policy "Users can delete own book assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'book-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

notify pgrst, 'reload schema';

select 'cutscene storage ready' as status;
