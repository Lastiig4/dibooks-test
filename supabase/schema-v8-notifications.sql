-- DiBooks notifications v1

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  title text not null,
  body text not null default '',
  link_path text,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx on public.user_notifications(user_id, created_at desc);
create index if not exists user_notifications_user_unread_idx on public.user_notifications(user_id, is_read, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "Users can read own notifications" on public.user_notifications;
create policy "Users can read own notifications"
on public.user_notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can mark own notifications" on public.user_notifications;
create policy "Users can mark own notifications"
on public.user_notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.create_user_notification(
  input_user_id uuid,
  input_actor_user_id uuid,
  input_event_type text,
  input_title text,
  input_body text default '',
  input_link_path text default null,
  input_resource_type text default null,
  input_resource_id uuid default null,
  input_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_notification_id uuid;
begin
  if input_user_id is null then
    return null;
  end if;

  if input_actor_user_id is not null and input_actor_user_id = input_user_id then
    return null;
  end if;

  insert into public.user_notifications (
    user_id,
    actor_user_id,
    event_type,
    title,
    body,
    link_path,
    resource_type,
    resource_id,
    metadata
  ) values (
    input_user_id,
    input_actor_user_id,
    coalesce(input_event_type, 'system'),
    coalesce(nullif(input_title, ''), 'Nieuwe melding'),
    coalesce(input_body, ''),
    input_link_path,
    input_resource_type,
    input_resource_id,
    coalesce(input_metadata, '{}'::jsonb)
  ) returning id into new_notification_id;

  return new_notification_id;
end;
$$;

grant execute on function public.create_user_notification(uuid, uuid, text, text, text, text, text, uuid, jsonb) to authenticated;

-- Connection notifications
create or replace function public.notify_connection_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    select coalesce(display_name, email, 'Iemand') into actor_name
    from public.profiles where id = new.requester_id;

    perform public.create_user_notification(
      new.receiver_id,
      new.requester_id,
      'connection_request',
      'Nieuw contactverzoek',
      actor_name || ' wil je toevoegen als contact.',
      '/account',
      'connection',
      new.id,
      jsonb_build_object('connection_id', new.id)
    );
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status and new.status in ('accepted','declined') then
    select coalesce(display_name, email, 'Iemand') into actor_name
    from public.profiles where id = new.receiver_id;

    perform public.create_user_notification(
      new.requester_id,
      new.receiver_id,
      case when new.status = 'accepted' then 'connection_accepted' else 'connection_declined' end,
      case when new.status = 'accepted' then 'Contactverzoek geaccepteerd' else 'Contactverzoek geweigerd' end,
      actor_name || case when new.status = 'accepted' then ' heeft je contactverzoek geaccepteerd.' else ' heeft je contactverzoek geweigerd.' end,
      '/account',
      'connection',
      new.id,
      jsonb_build_object('connection_id', new.id, 'status', new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_connection_events on public.user_connections;
create trigger trg_notify_connection_events
after insert or update of status on public.user_connections
for each row execute function public.notify_connection_events();

-- Book sharing notifications
create or replace function public.notify_book_share_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  book_title text;
begin
  if tg_op = 'INSERT' then
    select coalesce(display_name, email, 'Iemand') into actor_name from public.profiles where id = new.owner_id;
    select coalesce(title, 'een boek') into book_title from public.books where id = new.book_id;

    perform public.create_user_notification(
      new.shared_with_user_id,
      new.owner_id,
      'book_shared',
      'Boek met je gedeeld',
      actor_name || ' heeft ' || book_title || ' met je gedeeld.',
      '/dashboard',
      'book_share',
      new.id,
      jsonb_build_object('book_id', new.book_id, 'permission', new.permission)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_book_share_events on public.book_shares;
create trigger trg_notify_book_share_events
after insert on public.book_shares
for each row execute function public.notify_book_share_events();

-- Book feedback notifications
create or replace function public.notify_book_feedback_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  book_title text;
begin
  select coalesce(display_name, email, 'Iemand') into actor_name from public.profiles where id = new.from_user_id;
  select coalesce(title, 'een boek') into book_title from public.books where id = new.book_id;

  perform public.create_user_notification(
    new.owner_id,
    new.from_user_id,
    'book_feedback',
    'Nieuwe feedback',
    actor_name || ' heeft feedback gegeven op ' || book_title || '.',
    '/account',
    'book_feedback',
    new.id,
    jsonb_build_object('book_id', new.book_id, 'page_index', new.page_index)
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_book_feedback_events on public.book_feedback;
create trigger trg_notify_book_feedback_events
after insert on public.book_feedback
for each row execute function public.notify_book_feedback_events();

-- Book revision notifications
create or replace function public.notify_book_revision_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
  book_title text;
begin
  if tg_op = 'INSERT' then
    select coalesce(display_name, email, 'Iemand') into actor_name from public.profiles where id = new.editor_user_id;
    select coalesce(title, 'een boek') into book_title from public.books where id = new.book_id;

    perform public.create_user_notification(
      new.owner_id,
      new.editor_user_id,
      'book_revision',
      'Nieuw bewerkingsvoorstel',
      actor_name || ' heeft een bewerkingsvoorstel gestuurd voor ' || book_title || '.',
      '/account',
      'book_revision',
      new.id,
      jsonb_build_object('book_id', new.book_id)
    );
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status and new.status in ('accepted','rejected') then
    select coalesce(display_name, email, 'De eigenaar') into actor_name from public.profiles where id = new.owner_id;
    select coalesce(title, 'een boek') into book_title from public.books where id = new.book_id;

    perform public.create_user_notification(
      new.editor_user_id,
      new.owner_id,
      case when new.status = 'accepted' then 'book_revision_accepted' else 'book_revision_rejected' end,
      case when new.status = 'accepted' then 'Voorstel geaccepteerd' else 'Voorstel afgewezen' end,
      actor_name || case when new.status = 'accepted' then ' heeft je voorstel geaccepteerd voor ' else ' heeft je voorstel afgewezen voor ' end || book_title || '.',
      '/account',
      'book_revision',
      new.id,
      jsonb_build_object('book_id', new.book_id, 'status', new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_book_revision_events on public.book_revisions;
create trigger trg_notify_book_revision_events
after insert or update of status on public.book_revisions
for each row execute function public.notify_book_revision_events();

-- Chat notifications
create or replace function public.notify_chat_message_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  actor_name text;
  message_preview text;
begin
  select coalesce(display_name, email, 'Iemand') into actor_name from public.profiles where id = new.sender_id;
  message_preview := left(new.message, 120);

  for recipient_id in
    select user_id from public.chat_conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    perform public.create_user_notification(
      recipient_id,
      new.sender_id,
      'chat_message',
      'Nieuw chatbericht',
      actor_name || ': ' || message_preview,
      '/chat?conversation=' || new.conversation_id::text,
      'chat_message',
      new.id,
      jsonb_build_object('conversation_id', new.conversation_id)
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_chat_message_events on public.chat_messages;
create trigger trg_notify_chat_message_events
after insert on public.chat_messages
for each row execute function public.notify_chat_message_events();

-- Read APIs
create or replace function public.get_unread_notification_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.user_notifications n
  where n.user_id = auth.uid()
    and n.is_read = false;
$$;

grant execute on function public.get_unread_notification_count() to authenticated;

create or replace function public.get_user_notifications()
returns table (
  notification_id uuid,
  event_type text,
  title text,
  body text,
  link_path text,
  actor_user_id uuid,
  actor_email text,
  actor_display_name text,
  resource_type text,
  resource_id uuid,
  is_read boolean,
  created_at timestamptz,
  read_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    n.id,
    n.event_type,
    n.title,
    n.body,
    n.link_path,
    n.actor_user_id,
    p.email,
    p.display_name,
    n.resource_type,
    n.resource_id,
    n.is_read,
    n.created_at,
    n.read_at
  from public.user_notifications n
  left join public.profiles p on p.id = n.actor_user_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit 100;
$$;

grant execute on function public.get_user_notifications() to authenticated;

create or replace function public.mark_notification_read(input_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where id = input_notification_id
    and user_id = auth.uid();

  return found;
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and is_read = false;

  return true;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

notify pgrst, 'reload schema';
select 'notifications ready' as status;
