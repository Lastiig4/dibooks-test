-- DiBooks account model v2
-- Scheidt duidelijk tussen:
-- role = wat iemand mag beheren (reader / author / admin)
-- plan = toegang/abonnement (free / reader_plus / author_pro)

-- 1. Role uitbreiden met reader, zonder author/admin te breken.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'dibooks_user_role') then
    create type public.dibooks_user_role as enum ('reader', 'author', 'admin');
  else
    alter type public.dibooks_user_role add value if not exists 'reader';
  end if;
end $$;

-- 2. Plan bewust als text + check constraint houden.
-- Dit is flexibeler dan een enum wanneer je later pricing/plannen wijzigt.
alter table public.profiles
add column if not exists plan text not null default 'free';

alter table public.profiles
alter column plan type text using plan::text;

alter table public.profiles
alter column plan set default 'free';

-- Oude plannaam migreren.
update public.profiles
set plan = 'author_pro'
where plan = 'member';

alter table public.profiles
drop constraint if exists profiles_plan_check;

alter table public.profiles
add constraint profiles_plan_check
check (plan in ('free', 'reader_plus', 'author_pro', 'member'));

-- 3. Books alvast voorbereiden op gratis/premium leesrechten.
alter table public.books
add column if not exists access_type text not null default 'free';

alter table public.books
drop constraint if exists books_access_type_check;

alter table public.books
add constraint books_access_type_check
check (access_type in ('free', 'premium'));

-- 4. Nieuwe users krijgen standaard author/free zolang registratie nog auteurgericht is.
-- Later kunnen we bij registratie kiezen: Lezer account of Auteur account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, role, plan)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Auteur'),
    new.email,
    case
      when new.raw_user_meta_data->>'role' = 'admin' then 'admin'::public.dibooks_user_role
      when new.raw_user_meta_data->>'role' = 'reader' then 'reader'::public.dibooks_user_role
      else 'author'::public.dibooks_user_role
    end,
    case
      when new.raw_user_meta_data->>'plan' = 'reader_plus' then 'reader_plus'
      when new.raw_user_meta_data->>'plan' in ('author_pro', 'member') then 'author_pro'
      else 'free'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 5. Dashboard view opnieuw opbouwen zodat access_type ook beschikbaar is.
drop view if exists public.dashboard_books;

create view public.dashboard_books as
select
  b.id,
  b.owner_id,
  p.display_name as owner_name,
  p.email as owner_email,
  b.slug,
  b.title,
  b.author,
  b.subtitle,
  b.description,
  b.genres,
  b.primary_genre,
  b.status,
  b.age_rating,
  b.read_time,
  b.cover_image,
  b.banner_image,
  b.cover_class,
  b.accent_class,
  b.color_theme,
  b.access_type,
  b.published,
  b.featured,
  b.most_read,
  b.story_file,
  b.created_at,
  b.updated_at,
  b.published_at,
  b.removed_from_library_at,
  bp.project_data,
  bp.version as project_version,
  bp.updated_at as project_updated_at
from public.books b
left join public.profiles p on p.id = b.owner_id
left join public.book_projects bp on bp.book_id = b.id;

-- Test jezelf als Author Pro:
-- update public.profiles set plan = 'author_pro' where email = 'jouw@email.nl';
-- Test jezelf als Reader Plus:
-- update public.profiles set role = 'reader', plan = 'reader_plus' where email = 'jouw@email.nl';
