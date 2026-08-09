-- DiBooks v3 reader access, reading progress and favorites
-- Gratis boeken zijn leesbaar met een gratis account.
-- Premium boeken zijn leesbaar met reader_plus, author_pro of admin.
-- Gasten mogen Library en boekpagina's bekijken, maar niet lezen.

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

create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  current_node_id text not null default '',
  page_index integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table if not exists public.book_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.reading_progress enable row level security;
alter table public.book_favorites enable row level security;

-- Public metadata blijft zichtbaar voor live en binnenkort.
drop policy if exists "Public can read live and coming soon books" on public.books;
create policy "Public can read live and coming soon books"
on public.books
for select
to anon, authenticated
using (coalesce(published, false) = true or status::text = 'Binnenkort');

-- Direct project_data lezen alleen via owner/admin of ingelogde leestoegang.
drop policy if exists "Public can read live project data" on public.book_projects;
drop policy if exists "Authenticated readers can read allowed project data" on public.book_projects;
create policy "Authenticated readers can read allowed project data"
on public.book_projects
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.is_admin()
  or public.can_read_book(book_id)
);

-- Reading progress: alleen eigen voortgang.
drop policy if exists "Users can read own reading progress" on public.reading_progress;
create policy "Users can read own reading progress"
on public.reading_progress
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert own reading progress" on public.reading_progress;
create policy "Users can insert own reading progress"
on public.reading_progress
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own reading progress" on public.reading_progress;
create policy "Users can update own reading progress"
on public.reading_progress
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own reading progress" on public.reading_progress;
create policy "Users can delete own reading progress"
on public.reading_progress
for delete
to authenticated
using (user_id = auth.uid());

-- Favorites: alleen eigen favorieten.
drop policy if exists "Users can read own favorites" on public.book_favorites;
create policy "Users can read own favorites"
on public.book_favorites
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert own favorites" on public.book_favorites;
create policy "Users can insert own favorites"
on public.book_favorites
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can delete own favorites" on public.book_favorites;
create policy "Users can delete own favorites"
on public.book_favorites
for delete
to authenticated
using (user_id = auth.uid());

-- Wie mag een live boek lezen?
create or replace function public.can_read_book(input_book_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.books b
    left join public.profiles p on p.id = auth.uid()
    where b.id = input_book_id
      and auth.uid() is not null
      and coalesce(b.published, false) = true
      and (
        coalesce(b.access_type, 'free') = 'free'
        or p.role::text = 'admin'
        or p.plan::text in ('reader_plus', 'author_pro', 'member')
      )
  );
$$;

-- Reader RPC: geeft project_data alleen terug als gebruiker mag lezen.
create or replace function public.get_reader_book(input_book_id uuid)
returns table (
  id uuid,
  title text,
  author text,
  subtitle text,
  description text,
  access_type text,
  project_data jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.title,
    b.author,
    b.subtitle,
    b.description,
    coalesce(b.access_type, 'free') as access_type,
    bp.project_data
  from public.books b
  join public.book_projects bp on bp.book_id = b.id
  where b.id = input_book_id
    and public.can_read_book(b.id)
  limit 1;
$$;

-- Favorieten pagina: eigen favorieten + publieke metadata + eventuele voortgang.
create or replace function public.get_favorite_books()
returns table (
  id uuid,
  title text,
  author text,
  subtitle text,
  description text,
  genres text[],
  primary_genre text,
  status text,
  age_rating text,
  read_time text,
  cover_image text,
  banner_image text,
  cover_class text,
  accent_class text,
  access_type text,
  published boolean,
  favorite_created_at timestamptz,
  progress_current_node_id text,
  progress_page_index integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.title,
    b.author,
    b.subtitle,
    b.description,
    b.genres,
    b.primary_genre,
    b.status::text,
    b.age_rating,
    b.read_time,
    b.cover_image,
    b.banner_image,
    b.cover_class,
    b.accent_class,
    coalesce(b.access_type, 'free') as access_type,
    coalesce(b.published, false) as published,
    f.created_at as favorite_created_at,
    rp.current_node_id as progress_current_node_id,
    rp.page_index as progress_page_index
  from public.book_favorites f
  join public.books b on b.id = f.book_id
  left join public.reading_progress rp on rp.book_id = b.id and rp.user_id = f.user_id
  where f.user_id = auth.uid()
    and (
      coalesce(b.published, false) = true
      or b.status::text = 'Binnenkort'
    )
  order by f.created_at desc;
$$;

grant execute on function public.can_read_book(uuid) to anon, authenticated;
grant execute on function public.get_reader_book(uuid) to authenticated;
grant execute on function public.get_favorite_books() to authenticated;

notify pgrst, 'reload schema';

select 'reader access, progress and favorites ready' as status;
