begin;
-- Requires Talk about V1-V4 and the existing notifications schema.
create table if not exists public.talk_topic_preferences (
 user_id uuid not null references public.profiles(id) on delete cascade,
 topic_id uuid not null references public.talk_topics(id) on delete cascade,
 is_following boolean not null default false,
 is_muted boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(user_id,topic_id)
);
create index if not exists talk_topic_followers on public.talk_topic_preferences(topic_id,user_id) where is_following and not is_muted;
alter table public.talk_topic_preferences enable row level security;
revoke all on public.talk_topic_preferences from public,anon,authenticated;
grant select on public.talk_topic_preferences to authenticated;
drop policy if exists talk_preferences_own on public.talk_topic_preferences;
create policy talk_preferences_own on public.talk_topic_preferences for select to authenticated using(user_id=auth.uid());

create or replace function public.talk_set_preference(input_topic uuid,input_action text,input_enabled boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Log in om topics te volgen.'; end if;
 if input_action not in ('follow','mute') or input_action is null or input_enabled is null then raise exception 'Ongeldige voorkeur.'; end if;
 if not exists(select 1 from public.talk_topics where id=input_topic and not is_hidden) then raise exception 'Topic niet beschikbaar.'; end if;
 insert into public.talk_topic_preferences(user_id,topic_id,is_following,is_muted)
 values(auth.uid(),input_topic,case when input_action='follow' then input_enabled else false end,case when input_action='mute' then input_enabled else false end)
 on conflict(user_id,topic_id) do update set
 is_following=case when input_action='follow' then input_enabled else talk_topic_preferences.is_following end,
 is_muted=case when input_action='mute' then input_enabled else talk_topic_preferences.is_muted end,
 updated_at=now();
end $$;
revoke all on function public.talk_set_preference(uuid,text,boolean) from public;
grant execute on function public.talk_set_preference(uuid,text,boolean) to authenticated;

create or replace function public.talk_followed_topics(input_offset integer default 0)
returns setof public.talk_topics language sql stable security invoker set search_path=public,pg_temp as $$
 select t.* from public.talk_topics t join public.talk_topic_preferences p on p.topic_id=t.id
 where p.user_id=auth.uid() and p.is_following and not t.is_hidden
 order by p.updated_at desc,t.id limit 30 offset greatest(0,coalesce(input_offset,0));
$$;
revoke all on function public.talk_followed_topics(integer) from public;
grant execute on function public.talk_followed_topics(integer) to authenticated;

-- Replace the existing trigger function, keeping exactly one notification per recipient.
create or replace function public.talk_notify_reply() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare direct_recipient uuid;
begin
 if new.is_hidden then return new; end if;
 if not exists(select 1 from public.talk_topics where id=new.topic_id and not is_hidden) then return new; end if;
 if new.parent_reply_id is null then select author_id into direct_recipient from public.talk_topics where id=new.topic_id;
 else select author_id into direct_recipient from public.talk_replies where id=new.parent_reply_id and not is_hidden; end if;
 insert into public.user_notifications(user_id,actor_user_id,event_type,title,body,link_path,resource_type,resource_id)
 select recipients.user_id,new.author_id,
 case when recipients.user_id=direct_recipient then 'talk_reply' else 'talk_followed' end,
 case when recipients.user_id=direct_recipient then 'Nieuwe reactie op je bericht' else 'Nieuw bericht in een gevolgd topic' end,
 'Er is een nieuw bericht in Talk about. Open het gesprek om te lezen.',
 '/talk-about?topic='||new.topic_id::text||'&reply='||new.id::text,'talk_reply',new.id
 from (
  select direct_recipient as user_id
  union
  select p.user_id from public.talk_topic_preferences p where p.topic_id=new.topic_id and p.is_following
 ) recipients
 where recipients.user_id is not null and recipients.user_id<>new.author_id
 and not exists(select 1 from public.talk_topic_preferences p where p.user_id=recipients.user_id and p.topic_id=new.topic_id and p.is_muted);
 return new;
end $$;
revoke all on function public.talk_notify_reply() from public;
commit;
