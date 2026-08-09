-- DiBooks Supabase Reader Policy v1
-- Hiermee mogen lezers de project_data lezen van boeken die live/gepubliceerd zijn.
-- Nodig voor: /books/[bookId]/read voor Supabase-dashboardboeken.

drop policy if exists "Published project data readable by everyone" on public.book_projects;

create policy "Published project data readable by everyone"
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
