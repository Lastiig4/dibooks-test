-- DiBooks plan rules v1
-- Voegt account-plannen toe: free/member.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'dibooks_user_plan') then
    create type public.dibooks_user_plan as enum ('free', 'member');
  end if;
end $$;

alter table public.profiles
add column if not exists plan public.dibooks_user_plan not null default 'free';

-- Zorg dat nieuwe profielen standaard free zijn.
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
    'author',
    case when new.raw_user_meta_data->>'plan' = 'member' then 'member'::public.dibooks_user_plan else 'free'::public.dibooks_user_plan end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Voor testen kun je jezelf member maken door je eigen e-mail hieronder in te vullen.
-- update public.profiles
-- set plan = 'member'
-- where email = 'jouw@email.nl';
