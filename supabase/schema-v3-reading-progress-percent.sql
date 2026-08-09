-- DiBooks Reader Progress v3.1
-- Fixes resume reading and adds percentage progress.

alter table public.reading_progress
add column if not exists progress_percent integer not null default 0;

alter table public.reading_progress
drop constraint if exists reading_progress_percent_check;

alter table public.reading_progress
add constraint reading_progress_percent_check
check (progress_percent >= 0 and progress_percent <= 100);

-- Favorietenpagina: voeg voortgangspercentage toe aan de RPC output.
create or replace function public.get_favorite_books()
returns table (
  id uuid,
  slug text,
  title text,
  author text,
  subtitle text,
  description text,
  genres text[],
  primary_genre text,
  status text,
  published boolean,
  access_type text,
  age_rating text,
  read_time text,
  cover_image text,
  banner_image text,
  cover_class text,
  accent_class text,
  created_at timestamptz,
  updated_at timestamptz,
  favorite_created_at timestamptz,
  progress_page_index integer,
  progress_current_node_id text,
  progress_percent integer,
  progress_updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    b.id,
    b.slug,
    b.title,
    b.author,
    b.subtitle,
    b.description,
    b.genres,
    b.primary_genre,
    b.status,
    b.published,
    b.access_type,
    b.age_rating,
    b.read_time,
    b.cover_image,
    b.banner_image,
    b.cover_class,
    b.accent_class,
    b.created_at,
    b.updated_at,
    f.created_at as favorite_created_at,
    rp.page_index as progress_page_index,
    rp.current_node_id as progress_current_node_id,
    rp.progress_percent as progress_percent,
    rp.updated_at as progress_updated_at
  from public.book_favorites f
  join public.books b on b.id = f.book_id
  left join public.reading_progress rp
    on rp.book_id = b.id
   and rp.user_id = f.user_id
  where f.user_id = auth.uid()
    and auth.uid() is not null
  order by f.created_at desc;
$$;

grant execute on function public.get_favorite_books() to authenticated;

notify pgrst, 'reload schema';

select 'reading progress percent ready' as status;
