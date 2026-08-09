-- DiBooks v2.1: public coming-soon visibility + clean dashboard ownership
-- Binnenkort-boeken moeten publiek zichtbaar zijn in de Library en op de boekpagina.
-- Ze blijven NIET leesbaar in de reader, omdat book_projects alleen publiek is voor published=true.

alter table public.books enable row level security;
alter table public.book_projects enable row level security;

-- Zorg dat access_type bestaat voor gratis/premium boeken.
alter table public.books
add column if not exists access_type text not null default 'free';

alter table public.books
drop constraint if exists books_access_type_check;

alter table public.books
add constraint books_access_type_check
check (access_type in ('free', 'premium'));

-- Extra grants voor PostgREST/anon client. RLS bepaalt daarna alsnog welke rijen zichtbaar zijn.
grant select on public.books to anon, authenticated;
grant select on public.book_projects to anon, authenticated;

-- Verwijder oude/conflicterende publieke policies en maak één duidelijke policy.
drop policy if exists "Public can read live and coming soon books" on public.books;
drop policy if exists "Public can read published books" on public.books;
drop policy if exists "Public can read public book metadata" on public.books;

create policy "Public can read live and coming soon books"
on public.books
for select
to anon, authenticated
using (
  published = true
  or status = 'Binnenkort'
);

-- Eigenaar/admin mag eigen concepten ook blijven zien/beheren.
drop policy if exists "Authors can read own books" on public.books;
create policy "Authors can read own books"
on public.books
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

-- Projectdata: alléén publiek leesbaar voor live gepubliceerde boeken.
-- Binnenkort = detailpagina/aankondiging, maar geen reader.
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

-- Eigenaar/admin mag eigen projectdata lezen.
drop policy if exists "Authors can read own project data" on public.book_projects;
create policy "Authors can read own project data"
on public.book_projects
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

notify pgrst, 'reload schema';

select 'public coming soon books visible; dashboard shows own books only' as status;
