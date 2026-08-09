-- DiBooks social base v1: contacten / connecties

create extension if not exists pgcrypto;

create table if not exists public.user_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_connections_not_self check (requester_id <> receiver_id),
  constraint user_connections_status_check check (status in ('pending', 'accepted', 'declined', 'blocked')),
  constraint user_connections_unique_direction unique (requester_id, receiver_id)
);

create index if not exists user_connections_requester_idx on public.user_connections(requester_id);
create index if not exists user_connections_receiver_idx on public.user_connections(receiver_id);
create index if not exists user_connections_status_idx on public.user_connections(status);

alter table public.user_connections enable row level security;

drop policy if exists "Connection participants can read" on public.user_connections;
create policy "Connection participants can read"
on public.user_connections
for select
to authenticated
using (requester_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "Users can create own connection requests" on public.user_connections;
create policy "Users can create own connection requests"
on public.user_connections
for insert
to authenticated
with check (requester_id = auth.uid() and receiver_id <> auth.uid());

drop policy if exists "Connection receiver can respond" on public.user_connections;
create policy "Connection receiver can respond"
on public.user_connections
for update
to authenticated
using (receiver_id = auth.uid())
with check (receiver_id = auth.uid());

drop policy if exists "Connection participants can delete" on public.user_connections;
create policy "Connection participants can delete"
on public.user_connections
for delete
to authenticated
using (requester_id = auth.uid() or receiver_id = auth.uid());

create or replace function public.search_connectable_profiles(search_query text)
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  plan text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.email,
    coalesce(p.display_name, split_part(p.email, '@', 1)) as display_name,
    p.role::text as role,
    p.plan::text as plan
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(trim(search_query)) >= 3
    and (
      p.email ilike '%' || trim(search_query) || '%'
      or coalesce(p.display_name, '') ilike '%' || trim(search_query) || '%'
    )
  order by p.email asc
  limit 8;
$$;

grant execute on function public.search_connectable_profiles(text) to authenticated;

create or replace function public.get_user_connections()
returns table (
  connection_id uuid,
  other_user_id uuid,
  other_email text,
  other_display_name text,
  other_role text,
  other_plan text,
  requester_id uuid,
  receiver_id uuid,
  status text,
  direction text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id as connection_id,
    other_profile.id as other_user_id,
    other_profile.email as other_email,
    coalesce(other_profile.display_name, split_part(other_profile.email, '@', 1)) as other_display_name,
    other_profile.role::text as other_role,
    other_profile.plan::text as other_plan,
    c.requester_id,
    c.receiver_id,
    c.status,
    case when c.receiver_id = auth.uid() then 'incoming' else 'outgoing' end as direction,
    c.created_at,
    c.updated_at
  from public.user_connections c
  join public.profiles other_profile on other_profile.id = case
    when c.requester_id = auth.uid() then c.receiver_id
    else c.requester_id
  end
  where auth.uid() is not null
    and (c.requester_id = auth.uid() or c.receiver_id = auth.uid())
    and c.status in ('pending', 'accepted')
  order by
    case when c.status = 'pending' and c.receiver_id = auth.uid() then 0 else 1 end,
    c.updated_at desc;
$$;

grant execute on function public.get_user_connections() to authenticated;

create or replace function public.send_connection_request(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  inserted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'Invalid target user';
  end if;

  select id into existing_id
  from public.user_connections
  where (requester_id = auth.uid() and receiver_id = target_user_id)
     or (requester_id = target_user_id and receiver_id = auth.uid())
  limit 1;

  if existing_id is not null then
    update public.user_connections
    set status = case when status = 'declined' then 'pending' else status end,
        updated_at = now()
    where id = existing_id;

    return existing_id;
  end if;

  insert into public.user_connections (requester_id, receiver_id, status)
  values (auth.uid(), target_user_id, 'pending')
  returning id into inserted_id;

  return inserted_id;
end;
$$;

grant execute on function public.send_connection_request(uuid) to authenticated;

create or replace function public.respond_to_connection_request(target_connection_id uuid, new_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  if new_status not in ('accepted', 'declined') then
    raise exception 'Invalid response';
  end if;

  update public.user_connections
  set status = new_status,
      updated_at = now()
  where id = target_connection_id
    and receiver_id = auth.uid()
    and status = 'pending';

  return found;
end;
$$;

grant execute on function public.respond_to_connection_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';

select 'user connections ready' as status;
