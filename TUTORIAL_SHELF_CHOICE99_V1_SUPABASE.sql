-- DiBooks Tutorials Shelf + Choice Menu 99 V1
-- Run once in Supabase SQL Editor BEFORE deploying the patch.

begin;

alter table public.books
  add column if not exists official_tutorial boolean not null default false;

-- Er kan maximaal één officiële DiBooks tutorial tegelijk bovenaan staan.
create unique index if not exists books_single_official_tutorial_idx
  on public.books (official_tutorial)
  where official_tutorial = true;

comment on column public.books.official_tutorial is
  'Admin-controlled flag for the single official DiBooks tutorial that is always sorted first on the Tutorials shelf.';

commit;

select id, title, genres, primary_genre, official_tutorial, published, status
from public.books
where official_tutorial = true
   or primary_genre = 'Tutorial'
order by official_tutorial desc, updated_at desc;
