-- DiBooks - Series support
-- Eenmalig uitvoeren in Supabase SQL Editor,
-- of toepassen via je normale Supabase migration flow.

create table if not exists public.book_series (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_series_title_not_blank check (length(btrim(title)) > 0)
);

create unique index if not exists book_series_owner_title_unique
  on public.book_series (owner_id, lower(btrim(title)));

create index if not exists book_series_owner_id_idx
  on public.book_series (owner_id);

alter table public.books
  add column if not exists series_id uuid;

alter table public.books
  add column if not exists series_order integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'books_series_id_fkey'
      and conrelid = 'public.books'::regclass
  ) then
    alter table public.books
      add constraint books_series_id_fkey
      foreign key (series_id)
      references public.book_series(id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'books_series_order_positive'
      and conrelid = 'public.books'::regclass
  ) then
    alter table public.books
      add constraint books_series_order_positive
      check (series_order is null or series_order > 0);
  end if;
end
$$;

create index if not exists books_series_order_idx
  on public.books (series_id, series_order);

alter table public.book_series enable row level security;

drop policy if exists "book_series_select_own" on public.book_series;
create policy "book_series_select_own"
  on public.book_series
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "book_series_insert_own" on public.book_series;
create policy "book_series_insert_own"
  on public.book_series
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "book_series_update_own" on public.book_series;
create policy "book_series_update_own"
  on public.book_series
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "book_series_delete_own" on public.book_series;
create policy "book_series_delete_own"
  on public.book_series
  for delete
  to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.book_series to authenticated;
