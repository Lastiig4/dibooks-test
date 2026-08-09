-- DiBooks Account Hub v1
-- Adds an RPC for the account page to show recently read books with progress.

create or replace function public.get_reading_progress_books()
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
    coalesce(rp.progress_percent, 0) as progress_percent,
    rp.updated_at as progress_updated_at
  from public.reading_progress rp
  join public.books b on b.id = rp.book_id
  left join public.book_favorites f
    on f.book_id = b.id
   and f.user_id = rp.user_id
  where rp.user_id = auth.uid()
    and auth.uid() is not null
    and b.published = true
  order by rp.updated_at desc;
$$;

grant execute on function public.get_reading_progress_books() to authenticated;

notify pgrst, 'reload schema';

select 'account hub ready' as status;
