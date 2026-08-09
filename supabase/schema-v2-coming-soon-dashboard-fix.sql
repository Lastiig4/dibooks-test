-- DiBooks Coming Soon public metadata + clean dashboard ownership
-- Run this after v2 visibility/access schema.

alter table public.books enable row level security;
alter table public.book_projects enable row level security;

-- Zorg dat access_type bestaat, voor oudere databases.
alter table public.books
add column if not exists access_type text not null default 'free';

alter table public.books
drop constraint if exists books_access_type_check;

alter table public.books
add constraint books_access_type_check
check (access_type in ('free', 'premium'));

-- Publieke metadata: gepubliceerde boeken + Binnenkort-aankondigingen.
-- Concepten blijven privé.
drop policy if exists "Public can read live and coming soon books" on public.books;
create policy "Public can read live and coming soon books"
on public.books
for select
to anon, authenticated
using (
  published = true
  or status = 'Binnenkort'
);

-- Projectdata blijft alleen leesbaar als boek echt gepubliceerd is.
-- Binnenkort = alleen boekpagina/aankondiging, geen reader.
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

select 'coming soon visibility fixed' as status;
