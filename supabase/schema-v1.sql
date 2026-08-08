-- DiBooks Supabase Schema v1
-- Doel: echte accounts + eerste database-opslag voor auteurboeken.
-- Tabellen:
-- 1. profiles       = publieke profielgegevens van Supabase auth users
-- 2. books          = metadata van boeken in het dashboard
-- 3. book_projects  = volledige editor project JSON per boek
--
-- Plakken in Supabase:
-- Supabase Dashboard -> SQL Editor -> New query -> plak dit bestand -> Run

-- ------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Types
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'dibooks_user_role') then
    create type public.dibooks_user_role as enum ('author', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'dibooks_book_status') then
    create type public.dibooks_book_status as enum ('Concept', 'Testversie', 'Binnenkort');
  end if;
end $$;

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Auteur',
  email text,
  role public.dibooks_user_role not null default 'author',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ------------------------------------------------------------
-- books
-- ------------------------------------------------------------
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  slug text not null,
  title text not null,
  author text not null default 'Onbekende auteur',
  subtitle text not null default 'Nieuw interactief boek in concept.',
  description text not null default 'Nog geen beschrijving ingevuld.',

  genres text[] not null default array['Interactief'],
  primary_genre text not null default 'Interactief',
  status public.dibooks_book_status not null default 'Concept',
  age_rating text not null default '12+',
  read_time text not null default 'Concept',

  cover_image text,
  banner_image text,
  cover_class text,
  accent_class text,
  color_theme text not null default 'blue',

  published boolean not null default false,
  featured boolean not null default false,
  most_read boolean not null default false,

  published_at timestamptz,
  removed_from_library_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint books_owner_slug_unique unique (owner_id, slug)
);

alter table public.books enable row level security;

create index if not exists books_owner_id_idx on public.books(owner_id);
create index if not exists books_published_idx on public.books(published);
create index if not exists books_slug_idx on public.books(slug);

-- ------------------------------------------------------------
-- book_projects
-- ------------------------------------------------------------
create table if not exists public.book_projects (
  book_id uuid primary key references public.books(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_data jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.book_projects enable row level security;

create index if not exists book_projects_owner_id_idx on public.book_projects(owner_id);

-- ------------------------------------------------------------
-- Helper: updated_at automatisch verversen
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at
before update on public.books
for each row execute function public.set_updated_at();

drop trigger if exists book_projects_set_updated_at on public.book_projects;
create trigger book_projects_set_updated_at
before update on public.book_projects
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Helper: profiel automatisch maken na registratie
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Auteur'),
    new.email,
    'author'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Helper: admin check
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- ------------------------------------------------------------
-- RLS policies: profiles
-- ------------------------------------------------------------
drop policy if exists "Profiles are readable by owner or admin" on public.profiles;
create policy "Profiles are readable by owner or admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Geen gewone insert policy nodig: handle_new_user maakt profiel automatisch.

-- ------------------------------------------------------------
-- RLS policies: books
-- ------------------------------------------------------------
drop policy if exists "Published books are readable by everyone" on public.books;
create policy "Published books are readable by everyone"
on public.books
for select
to anon, authenticated
using (published = true);

drop policy if exists "Authors can read own books" on public.books;
create policy "Authors can read own books"
on public.books
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Authors can insert own books" on public.books;
create policy "Authors can insert own books"
on public.books
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "Authors can update own books" on public.books;
create policy "Authors can update own books"
on public.books
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Authors can delete own unpublished books" on public.books;
create policy "Authors can delete own unpublished books"
on public.books
for delete
to authenticated
using ((owner_id = auth.uid() and published = false) or public.is_admin());

-- ------------------------------------------------------------
-- RLS policies: book_projects
-- Project JSON is niet publiek. Alleen eigenaar/admin.
-- ------------------------------------------------------------
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
with check (owner_id = auth.uid());

drop policy if exists "Authors can update own project data" on public.book_projects;
create policy "Authors can update own project data"
on public.book_projects
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Authors can delete own project data" on public.book_projects;
create policy "Authors can delete own project data"
on public.book_projects
for delete
to authenticated
using (owner_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------
-- View voor dashboard: boek + project samen ophalen
-- Let op: view respecteert onderliggende RLS via security_invoker.
-- ------------------------------------------------------------
create or replace view public.dashboard_books
with (security_invoker = true)
as
select
  b.*,
  p.project_data,
  p.version as project_version,
  p.updated_at as project_updated_at
from public.books b
left join public.book_projects p on p.book_id = b.id;

-- ------------------------------------------------------------
-- Klaar.
-- Test na uitvoeren:
-- 1. Registreer/login via DiBooks
-- 2. Check Supabase Table Editor -> profiles
-- 3. Volgende stap: app/dashboard en app/editor koppelen aan deze tabellen
-- ------------------------------------------------------------
