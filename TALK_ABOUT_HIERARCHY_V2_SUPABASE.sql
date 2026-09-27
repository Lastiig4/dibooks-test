-- Upgrade existing Talk about V1. Keeps all existing topics and messages.
begin;
-- Temporarily remove the insertion trigger only within this transaction so
-- the migration can preserve the original author without a signed-in session.
drop trigger if exists talk_prepare on public.talk_spaces;
insert into public.talk_spaces(id,author_id,author_name,title,description)
select '39d5b70d-f5e5-49a1-9c64-7f391e0fa201'::uuid, t.author_id, 'DiBooks',
 'Bestaande gesprekken', 'Gesprekken die voor de nieuwe forumindeling zijn gestart.'
from public.talk_topics t where t.space_id is null order by t.created_at limit 1
on conflict(id) do nothing;
update public.talk_topics set space_id = '39d5b70d-f5e5-49a1-9c64-7f391e0fa201'::uuid where space_id is null;
create trigger talk_prepare before insert on public.talk_spaces for each row execute function public.talk_prepare_post();
alter table public.talk_topics alter column space_id set not null;
alter table public.talk_topics drop constraint if exists talk_topics_space_id_fkey;
alter table public.talk_topics add constraint talk_topics_space_id_fkey foreign key(space_id) references public.talk_spaces(id) on delete restrict;
create table if not exists public.talk_exclusive_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_by uuid references auth.users(id) on delete set null,
 granted_at timestamptz not null default now()
);
alter table public.talk_exclusive_members enable row level security;
revoke all on public.talk_exclusive_members from public, anon, authenticated;

create or replace function public.talk_can_create_subject() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select auth.uid() is not null and (
 exists(select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin')
 or exists(select 1 from public.talk_exclusive_members m where m.user_id = auth.uid()));
$$;
create or replace function public.talk_admin_find_members(search_text text default '')
returns table(user_id uuid, display_name text, email text, is_exclusive boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
 if not exists(select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin') then raise exception 'Alleen admins kunnen Exclusive beheren.'; end if;
 return query select p.id, coalesce(p.display_name,'Gebruiker')::text, p.email::text, exists(select 1 from public.talk_exclusive_members m where m.user_id = p.id)
 from public.profiles p
 where length(btrim(search_text)) >= 2 and (p.display_name ilike '%' || left(search_text,100) || '%' or p.email ilike '%' || left(search_text,100) || '%')
 order by p.display_name, p.id limit 30;
end $$;
create or replace function public.talk_admin_set_exclusive(target_user_id uuid, enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if not exists(select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin') then raise exception 'Alleen admins kunnen Exclusive beheren.'; end if;
 if not exists(select 1 from public.profiles p where p.id = target_user_id) then raise exception 'Account niet gevonden.'; end if;
 if enabled then
   insert into public.talk_exclusive_members(user_id,granted_by) values(target_user_id,auth.uid()) on conflict(user_id) do nothing;
 else
   delete from public.talk_exclusive_members where user_id = target_user_id;
 end if;
end $$;
revoke all on function public.talk_can_create_subject(), public.talk_admin_find_members(text), public.talk_admin_set_exclusive(uuid,boolean) from public;
grant execute on function public.talk_can_create_subject() to authenticated;
grant execute on function public.talk_admin_find_members(text), public.talk_admin_set_exclusive(uuid,boolean) to authenticated;
drop policy if exists talk_spaces_write on public.talk_spaces;
create policy talk_spaces_write on public.talk_spaces for insert to authenticated with check (author_id = auth.uid() and public.talk_can_create_subject());
drop policy if exists talk_spaces_delete on public.talk_spaces;
create policy talk_spaces_delete on public.talk_spaces for delete to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='admin'));
commit;
