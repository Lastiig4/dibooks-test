-- DiBooks book visibility + access type
-- Concept = alleen auteur/admin dashboard
-- Binnenkort = zichtbaar in Library/detailpagina, niet leesbaar
-- Gepubliceerd = zichtbaar en leesbaar volgens access_type-regels

alter table public.books enable row level security;
alter table public.book_projects enable row level security;

alter table public.books
add column if not exists access_type text not null default 'free';

alter table public.books
drop constraint if exists books_access_type_check;

alter table public.books
add constraint books_access_type_check
check (access_type in ('free', 'premium'));

update public.books
set access_type = 'free'
where access_type is null;

-- Publieke metadata: live boeken en Binnenkort-aankondigingen.
drop policy if exists "Public can read live and coming soon books" on public.books;
create policy "Public can read live and coming soon books"
on public.books
for select
to anon, authenticated
using (
  published = true
  or status = 'Binnenkort'
);

-- Projectdata blijft alleen publiek voor gepubliceerde boeken.
-- Binnenkort-boeken krijgen dus wel een boekpagina, maar geen Reader toegang.
drop policy if exists "Public can read published project data" on public.book_projects;
create policy "Public can read published project data"
on public.book_projects
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.books b
    where b.id = book_projects.book_id
      and b.published = true
  )
);

notify pgrst, 'reload schema';

select 'book visibility and access ready' as status;
