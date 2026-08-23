-- DiBooks - publieke serie-strip op boekpagina
-- Eenmalig uitvoeren in Supabase SQL Editor.
--
-- Geeft ALLEEN boeken terug die publiek zichtbaar mogen zijn:
-- - gepubliceerd/live
-- - of status Binnenkort
-- Privé Concept/Testversie-boeken worden niet gelekt.

create or replace function public.get_public_book_series(input_book_id uuid)
returns table (
  book_id uuid,
  title text,
  subtitle text,
  cover_image text,
  status text,
  published boolean,
  series_id uuid,
  series_title text,
  series_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  with selected_book as (
    select b.series_id
    from public.books b
    where b.id = input_book_id
      and (b.published = true or b.status = 'Binnenkort')
    limit 1
  )
  select
    b.id as book_id,
    b.title,
    coalesce(b.subtitle, '') as subtitle,
    coalesce(b.cover_image, '') as cover_image,
    b.status,
    b.published,
    b.series_id,
    s.title as series_title,
    b.series_order
  from public.books b
  join public.book_series s on s.id = b.series_id
  where b.series_id is not null
    and b.series_id = (select series_id from selected_book)
    and (b.published = true or b.status = 'Binnenkort')
  order by b.series_order asc nulls last, b.created_at asc;
$$;

revoke all on function public.get_public_book_series(uuid) from public;
grant execute on function public.get_public_book_series(uuid) to anon, authenticated;
