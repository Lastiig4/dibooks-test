-- DiBooks public Library visibility fix v3
-- Binnenkort-boeken zijn publiek zichtbaar, maar niet leesbaar.
-- Live boeken zijn publiek zichtbaar en de Reader mag alleen project_data lezen voor live boeken.

alter table public.books enable row level security;
alter table public.book_projects enable row level security;

drop policy if exists "Public can read published books" on public.books;
drop policy if exists "Public can read live books" on public.books;
drop policy if exists "Public can read live and coming soon books" on public.books;

create policy "Public can read live and coming soon books"
on public.books
for select
to anon, authenticated
using (published = true or status = 'Binnenkort');

-- Reader/project data blijft alleen openbaar voor live/gepubliceerde boeken.
drop policy if exists "Public can read published project data" on public.book_projects;
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
      and b.published = true
  )
);

notify pgrst, 'reload schema';

select 'public library access ready' as status;
