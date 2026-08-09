-- DiBooks editor save policy repair
-- Run this once if updating an existing dashboard concept fails in the editor.

alter table public.books enable row level security;
alter table public.book_projects enable row level security;

-- Books: owner/admin can read/update/delete own unpublished books.
drop policy if exists "Authors can read own books" on public.books;
create policy "Authors can read own books"
on public.books
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Authors can update own books" on public.books;
create policy "Authors can update own books"
on public.books
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

-- Book projects: owner/admin can insert/update project_data.
drop policy if exists "Authors can read own project data" on public.book_projects;
create policy "Authors can read own project data"
on public.book_projects
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Authors can insert own project data" on public.book_projects;
create policy "Authors can insert own project data"
on public.book_projects
for insert
to authenticated
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Authors can update own project data" on public.book_projects;
create policy "Authors can update own project data"
on public.book_projects
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

-- quick check
select 'editor save policies ready' as status;
