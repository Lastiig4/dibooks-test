-- Run once in the Supabase SQL editor before deploying this patch.
begin;
create table if not exists public.book_reviews (
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 4000),
  contains_spoilers boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (book_id, user_id),
  constraint book_reviews_has_content check (rating is not null or char_length(btrim(body)) > 0)
);
alter table public.book_reviews enable row level security;
revoke all on public.book_reviews from anon, authenticated;
grant select, insert on public.book_reviews to authenticated;
drop policy if exists book_reviews_read_own on public.book_reviews;
create policy book_reviews_read_own on public.book_reviews for select to authenticated using (user_id = auth.uid());
drop policy if exists book_reviews_insert_own on public.book_reviews;
create policy book_reviews_insert_own on public.book_reviews for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.reading_progress p where p.book_id = book_reviews.book_id and p.user_id = auth.uid())
  and exists (
    select 1 from public.books b where b.id = book_reviews.book_id and b.published = true
    and coalesce((to_jsonb(b)->>'official_tutorial')::boolean, false) = false
    and lower(btrim(coalesce(b.primary_genre, ''))) <> 'tutorial'
    and not exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(to_jsonb(b)->'genres') = 'array' then to_jsonb(b)->'genres' else '[]'::jsonb end) g where lower(btrim(g)) = 'tutorial')
  )
);
-- Reviews remain private until a controlled book-page/forum read API is added.
-- No public SELECT on full review text: spoiler excerpts cannot leak via a feed.
commit;
