begin;
-- Public presentation fields are separate from private account data.
create table if not exists public.community_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 bio text not null default '' check(char_length(bio)<=1000),
 avatar text not null default '' check(avatar='' or (length(avatar)<=180000 and avatar ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'))
);
alter table public.community_profiles enable row level security;
revoke all on public.community_profiles from public,anon,authenticated;
create or replace function public.save_community_profile(input_bio text,input_avatar text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Log in om je profiel te wijzigen.'; end if;
 insert into public.community_profiles(user_id,bio,avatar) values(auth.uid(),btrim(input_bio),input_avatar)
 on conflict(user_id) do update set bio=excluded.bio,avatar=excluded.avatar;
end $$;
create or replace function public.get_community_profiles(input_ids uuid[]) returns table(id uuid,display_name text,author_name text,bio text,avatar text,is_admin boolean,is_author boolean,is_exclusive boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,coalesce(nullif(btrim(p.display_name),''),'Lezer')::text,coalesce(p.author_name,'')::text,coalesce(c.bio,''),coalesce(c.avatar,''),p.role::text='admin',
 (p.role::text='author' or exists(select 1 from public.books b where b.owner_id=p.id and b.published)),
 exists(select 1 from public.talk_exclusive_members e where e.user_id=p.id)
 from public.profiles p left join public.community_profiles c on c.user_id=p.id
 where p.id=any(input_ids[1:100]);
$$;
create or replace function public.get_community_books(input_user uuid) returns table(id uuid,title text,cover_image text,author text)
language sql stable security definer set search_path=public,pg_temp as $$
 select b.id,b.title::text,coalesce(b.cover_image,'')::text,coalesce(b.author,'')::text from public.books b where b.owner_id=input_user and b.published order by b.title,b.id;
$$;
revoke all on function public.save_community_profile(text,text),public.get_community_profiles(uuid[]),public.get_community_books(uuid) from public;
grant execute on function public.save_community_profile(text,text) to authenticated;
grant execute on function public.get_community_profiles(uuid[]),public.get_community_books(uuid) to anon,authenticated;
commit;
