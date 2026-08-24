-- DiBooks Guest Library Experience V2
-- Voer dit één keer uit in Supabase SQL Editor.
--
-- Privacy: deze functie geeft alleen book_id + het aantal unieke lezers terug.
-- Er worden geen user IDs, pagina's, story state of andere leesgegevens
-- naar de publieke frontend gestuurd.

create or replace function public.get_public_book_popularity()
returns table (
  book_id text,
  reader_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    rp.book_id::text as book_id,
    count(distinct rp.user_id)::bigint as reader_count
  from public.reading_progress rp
  where rp.book_id is not null
  group by rp.book_id
  order by count(distinct rp.user_id) desc, rp.book_id::text asc;
$$;

revoke all on function public.get_public_book_popularity() from public;
grant execute on function public.get_public_book_popularity() to anon;
grant execute on function public.get_public_book_popularity() to authenticated;

comment on function public.get_public_book_popularity() is
  'Public aggregate popularity for DiBooks. Returns only book_id and unique reader count.';
