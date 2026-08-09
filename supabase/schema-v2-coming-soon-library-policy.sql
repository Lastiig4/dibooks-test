-- DiBooks coming soon library visibility
-- Maakt boeken met status Binnenkort zichtbaar in de publieke Library/detailpagina,
-- zonder dat ze leesbaar worden in de Reader.

alter table public.books enable row level security;
alter table public.book_projects enable row level security;

-- Publiek mag live boeken zien én aankondigingen met status Binnenkort.
drop policy if exists "Public can read live and coming soon books" on public.books;
create policy "Public can read live and coming soon books"
on public.books
for select
to anon, authenticated
using (
  published = true
  or status = 'Binnenkort'
);

-- Projectdata blijft alleen publiek leesbaar voor gepubliceerde boeken.
-- Binnenkort-boeken hebben dus wel een boekpagina, maar geen leesbare Reader.
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

select 'coming soon library policy ready' as status;
