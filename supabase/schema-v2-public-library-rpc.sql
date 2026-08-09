-- DiBooks public library RPC fix
-- Binnenkort en live boeken moeten publiek zichtbaar zijn voor iedereen.
-- Conceptboeken blijven privé. Reader/project_data blijft alleen voor live boeken.

alter table public.books enable row level security;
alter table public.book_projects enable row level security;

-- Houd gewone RLS ook correct, maar de app gebruikt hieronder vooral de RPC.
drop policy if exists "Public can read live and coming soon books" on public.books;
create policy "Public can read live and coming soon books"
on public.books
for select
to anon, authenticated
using (coalesce(published, false) = true or status::text = 'Binnenkort');

-- Publieke lijst voor de Library. Security definer voorkomt gedoe met owner-only dashboard policies.
create or replace function public.get_public_library_books()
returns setof public.books
language sql
stable
security definer
set search_path = public
as $$
  select b.*
  from public.books b
  where coalesce(b.published, false) = true
     or b.status::text = 'Binnenkort'
  order by
    coalesce(b.published_at, b.updated_at, b.created_at) desc;
$$;

create or replace function public.get_public_library_book(input_book_id uuid)
returns setof public.books
language sql
stable
security definer
set search_path = public
as $$
  select b.*
  from public.books b
  where b.id = input_book_id
    and (
      coalesce(b.published, false) = true
      or b.status::text = 'Binnenkort'
    )
  limit 1;
$$;

grant execute on function public.get_public_library_books() to anon, authenticated;
grant execute on function public.get_public_library_book(uuid) to anon, authenticated;

-- Reader/project_data blijft alleen openbaar voor live/gepubliceerde boeken.
drop policy if exists "Public can read live project data" on public.book_projects;
create policy "Public can read live project data"
on public.book_projects
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.books b
    where b.id = book_projects.book_id
      and coalesce(b.published, false) = true
  )
);

notify pgrst, 'reload schema';

select 'public library rpc ready' as status;
