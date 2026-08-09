-- DiBooks chat v1

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null default 'direct',
  related_book_id uuid references public.books(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_conversations drop constraint if exists chat_conversations_type_check;
alter table public.chat_conversations add constraint chat_conversations_type_check check (conversation_type in ('direct','book'));

create table if not exists public.chat_conversation_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  related_book_id uuid references public.books(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Users can see own conversations" on public.chat_conversations;
create policy "Users can see own conversations" on public.chat_conversations
for select to authenticated
using (
  exists (
    select 1 from public.chat_conversation_members m
    where m.conversation_id = public.chat_conversations.id and m.user_id = auth.uid()
  )
);

drop policy if exists "Users can see own conversation members" on public.chat_conversation_members;
create policy "Users can see own conversation members" on public.chat_conversation_members
for select to authenticated
using (
  exists (
    select 1 from public.chat_conversation_members m
    where m.conversation_id = public.chat_conversation_members.conversation_id and m.user_id = auth.uid()
  )
);

drop policy if exists "Users can see own chat messages" on public.chat_messages;
create policy "Users can see own chat messages" on public.chat_messages
for select to authenticated
using (
  exists (
    select 1 from public.chat_conversation_members m
    where m.conversation_id = public.chat_messages.conversation_id and m.user_id = auth.uid()
  )
);

-- Writes go through security-definer RPCs.

drop function if exists public.get_or_create_direct_conversation(uuid);
create function public.get_or_create_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_conversation_id uuid;
  new_conversation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Login nodig.';
  end if;

  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'Ongeldige contactpersoon.';
  end if;

  if not exists (
    select 1 from public.user_connections c
    where c.status = 'accepted'
      and ((c.requester_id = auth.uid() and c.receiver_id = target_user_id)
        or (c.receiver_id = auth.uid() and c.requester_id = target_user_id))
  ) then
    raise exception 'Je kunt alleen chatten met geaccepteerde contacten.';
  end if;

  select cm1.conversation_id into existing_conversation_id
  from public.chat_conversation_members cm1
  join public.chat_conversation_members cm2 on cm2.conversation_id = cm1.conversation_id
  join public.chat_conversations cc on cc.id = cm1.conversation_id
  where cc.conversation_type = 'direct'
    and cm1.user_id = auth.uid()
    and cm2.user_id = target_user_id
    and (
      select count(*) from public.chat_conversation_members cm3
      where cm3.conversation_id = cm1.conversation_id
    ) = 2
  limit 1;

  if existing_conversation_id is not null then
    return existing_conversation_id;
  end if;

  insert into public.chat_conversations (conversation_type, created_by, updated_at)
  values ('direct', auth.uid(), now())
  returning id into new_conversation_id;

  insert into public.chat_conversation_members (conversation_id, user_id)
  values (new_conversation_id, auth.uid()), (new_conversation_id, target_user_id);

  return new_conversation_id;
end;
$$;

grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

drop function if exists public.get_user_chat_conversations();
create function public.get_user_chat_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_email text,
  other_display_name text,
  other_role text,
  other_plan text,
  related_book_id uuid,
  related_book_title text,
  last_message text,
  last_message_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with my_conversations as (
    select cc.id, cc.related_book_id, cc.updated_at
    from public.chat_conversations cc
    join public.chat_conversation_members me on me.conversation_id = cc.id
    where me.user_id = auth.uid()
  ), other_members as (
    select mc.id as conversation_id, mc.related_book_id, mc.updated_at, p.id as other_user_id, p.email, p.display_name, p.role, p.plan
    from my_conversations mc
    join public.chat_conversation_members om on om.conversation_id = mc.id and om.user_id <> auth.uid()
    join public.profiles p on p.id = om.user_id
  ), latest as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.message,
      m.created_at
    from public.chat_messages m
    join my_conversations mc on mc.id = m.conversation_id
    order by m.conversation_id, m.created_at desc
  )
  select
    om.conversation_id,
    om.other_user_id,
    om.email,
    om.display_name,
    om.role::text,
    om.plan::text,
    om.related_book_id,
    b.title,
    l.message,
    l.created_at,
    om.updated_at
  from other_members om
  left join latest l on l.conversation_id = om.conversation_id
  left join public.books b on b.id = om.related_book_id
  order by coalesce(l.created_at, om.updated_at) desc;
$$;

grant execute on function public.get_user_chat_conversations() to authenticated;

drop function if exists public.get_chat_messages(uuid);
create function public.get_chat_messages(input_conversation_id uuid)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_email text,
  sender_display_name text,
  message text,
  related_book_id uuid,
  related_book_title text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    p.email,
    p.display_name,
    m.message,
    m.related_book_id,
    b.title,
    m.created_at
  from public.chat_messages m
  join public.profiles p on p.id = m.sender_id
  left join public.books b on b.id = m.related_book_id
  where m.conversation_id = input_conversation_id
    and exists (
      select 1 from public.chat_conversation_members cm
      where cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
    )
  order by m.created_at asc;
$$;

grant execute on function public.get_chat_messages(uuid) to authenticated;

drop function if exists public.send_chat_message(uuid, text, uuid);
create function public.send_chat_message(input_conversation_id uuid, input_message text, input_related_book_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_message_id uuid;
begin
  if auth.uid() is null then raise exception 'Login nodig.'; end if;
  if length(trim(coalesce(input_message, ''))) < 1 then raise exception 'Bericht is leeg.'; end if;

  if not exists (
    select 1 from public.chat_conversation_members cm
    where cm.conversation_id = input_conversation_id and cm.user_id = auth.uid()
  ) then
    raise exception 'Geen toegang tot dit gesprek.';
  end if;

  insert into public.chat_messages (conversation_id, sender_id, message, related_book_id)
  values (input_conversation_id, auth.uid(), trim(input_message), input_related_book_id)
  returning id into new_message_id;

  update public.chat_conversations
  set updated_at = now()
  where id = input_conversation_id;

  return new_message_id;
end;
$$;

grant execute on function public.send_chat_message(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
select 'chat ready' as status;
