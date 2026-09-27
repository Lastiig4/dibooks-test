begin;
alter table public.talk_topics add column if not exists is_closed boolean not null default false;
alter table public.talk_topics add column if not exists is_pinned boolean not null default false;
alter table public.talk_topics add column if not exists is_hidden boolean not null default false;
alter table public.talk_replies add column if not exists is_hidden boolean not null default false;
alter table public.talk_replies add column if not exists parent_reply_id uuid references public.talk_replies(id) on delete set null;
create index if not exists talk_reply_parent on public.talk_replies(parent_reply_id);
grant insert(parent_reply_id) on public.talk_replies to authenticated;

create or replace function public.talk_is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role::text='admin');
$$;
revoke all on function public.talk_is_admin() from public;
grant execute on function public.talk_is_admin() to anon,authenticated;
drop policy if exists talk_topics_read on public.talk_topics;
create policy talk_topics_read on public.talk_topics for select using (not is_hidden);
drop policy if exists talk_replies_read on public.talk_replies;
create policy talk_replies_read on public.talk_replies for select using (not is_hidden and exists(select 1 from public.talk_topics t where t.id=topic_id and not t.is_hidden));

create or replace function public.talk_validate_reply() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.talk_topics; p public.talk_replies;
begin
 select * into t from public.talk_topics where id=new.topic_id for share;
 if not found or t.is_hidden or t.is_closed then raise exception 'Dit topic is gesloten of niet beschikbaar.'; end if;
 if new.parent_reply_id is not null then
  select * into p from public.talk_replies where id=new.parent_reply_id for share;
  if not found or p.topic_id<>new.topic_id or p.is_hidden then raise exception 'Dit bericht is niet beschikbaar om op te reageren.'; end if;
 end if;
 return new;
end $$;
revoke all on function public.talk_validate_reply() from public;
drop trigger if exists talk_validate_reply on public.talk_replies;
create trigger talk_validate_reply before insert on public.talk_replies for each row execute function public.talk_validate_reply();

create or replace function public.talk_notify_reply() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient uuid;
begin
 if new.parent_reply_id is null then select author_id into recipient from public.talk_topics where id=new.topic_id;
 else select author_id into recipient from public.talk_replies where id=new.parent_reply_id; end if;
 if recipient is not null and recipient<>new.author_id then
  insert into public.user_notifications(user_id,actor_user_id,event_type,title,body,link_path,resource_type,resource_id)
  values(recipient,new.author_id,'talk_reply','Nieuwe reactie op je bericht','Er is op je bericht in Talk about gereageerd.', '/talk-about?topic='||new.topic_id::text||'&reply='||new.id::text,'talk_reply',new.id);
 end if;
 return new;
end $$;
revoke all on function public.talk_notify_reply() from public;
drop trigger if exists talk_notify_reply on public.talk_replies;
create trigger talk_notify_reply after insert on public.talk_replies for each row execute function public.talk_notify_reply();

create table if not exists public.talk_reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references auth.users(id) on delete cascade,
 topic_id uuid not null references public.talk_topics(id) on delete cascade,
 reply_id uuid references public.talk_replies(id) on delete cascade,
 reason text not null check(char_length(btrim(reason)) between 3 and 1000),
 status text not null default 'open' check(status in ('open','hidden','dismissed')),
 created_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid references auth.users(id) on delete set null
);
create unique index if not exists talk_report_once on public.talk_reports(reporter_id,topic_id,coalesce(reply_id,'00000000-0000-0000-0000-000000000000'::uuid));
alter table public.talk_reports enable row level security;
revoke all on public.talk_reports from public,anon,authenticated;
create or replace function public.talk_report(input_topic uuid,input_reply uuid,input_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare report_id uuid;
begin
 if auth.uid() is null then raise exception 'Log in om te rapporteren.'; end if;
 if not exists(select 1 from public.talk_topics where id=input_topic and not is_hidden) then raise exception 'Topic niet beschikbaar.'; end if;
 if input_reply is not null and not exists(select 1 from public.talk_replies where id=input_reply and topic_id=input_topic and not is_hidden) then raise exception 'Bericht niet beschikbaar.'; end if;
 insert into public.talk_reports(reporter_id,topic_id,reply_id,reason) values(auth.uid(),input_topic,input_reply,btrim(input_reason)) on conflict do nothing returning id into report_id;
 if report_id is not null then
  insert into public.user_notifications(user_id,actor_user_id,event_type,title,body,link_path,resource_type,resource_id)
  select id,auth.uid(),'talk_report','Bericht gerapporteerd','Er staat een nieuwe forumrapportage klaar voor beoordeling.','/talk-about/moderation','talk_report',report_id from public.profiles where role::text='admin';
 end if;
end $$;
create or replace function public.talk_admin_reports() returns table(id uuid,topic_id uuid,reply_id uuid,reason text,created_at timestamptz,reporter_name text,author_name text,title text,body text,contains_spoilers boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.talk_is_admin() then raise exception 'Alleen admins.'; end if;
 return query select r.id,r.topic_id,r.reply_id,r.reason,r.created_at,coalesce(p.display_name,'Lezer')::text,case when r.reply_id is null then t.author_name else a.author_name end,t.title,case when r.reply_id is null then t.body else a.body end,case when r.reply_id is null then t.contains_spoilers else a.contains_spoilers end
 from public.talk_reports r join public.talk_topics t on t.id=r.topic_id left join public.talk_replies a on a.id=r.reply_id left join public.profiles p on p.id=r.reporter_id where r.status='open' order by r.created_at,r.id limit 100;
end $$;
create or replace function public.talk_admin_resolve(input_report uuid,hide_content boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.talk_reports;
begin
 if not public.talk_is_admin() then raise exception 'Alleen admins.'; end if;
 select * into r from public.talk_reports where id=input_report and status='open' for update;
 if not found then raise exception 'Deze rapportage is al afgehandeld.'; end if;
 if hide_content then
  if r.reply_id is null then update public.talk_topics set is_hidden=true where id=r.topic_id;
  else update public.talk_replies set is_hidden=true where id=r.reply_id; end if;
 end if;
 update public.talk_reports set status=case when hide_content then 'hidden' else 'dismissed' end,resolved_at=now(),resolved_by=auth.uid() where status='open' and topic_id=r.topic_id and reply_id is not distinct from r.reply_id;
end $$;
create or replace function public.talk_admin_topic(input_topic uuid,action text,enabled boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.talk_is_admin() then raise exception 'Alleen admins.'; end if;
 if action='closed' then update public.talk_topics set is_closed=enabled where id=input_topic;
 elsif action='pinned' then update public.talk_topics set is_pinned=enabled where id=input_topic;
 else raise exception 'Ongeldige actie.'; end if;
end $$;
-- Resolve notification/parent links to the correct page; never return hidden text.
create or replace function public.talk_reply_offset(input_topic uuid,input_reply uuid) returns integer language sql stable security definer set search_path=public,pg_temp as $$
 select (count(*)/30*30)::integer from public.talk_replies r join public.talk_replies target on target.id=input_reply and target.topic_id=input_topic and not target.is_hidden
 where r.topic_id=input_topic and not r.is_hidden and (r.created_at,r.id)<(target.created_at,target.id) and exists(select 1 from public.talk_topics t where t.id=input_topic and not t.is_hidden);
$$;
revoke all on function public.talk_report(uuid,uuid,text),public.talk_admin_reports(),public.talk_admin_resolve(uuid,boolean),public.talk_admin_topic(uuid,text,boolean),public.talk_reply_offset(uuid,uuid) from public;
grant execute on function public.talk_report(uuid,uuid,text),public.talk_admin_reports(),public.talk_admin_resolve(uuid,boolean),public.talk_admin_topic(uuid,text,boolean) to authenticated;
grant execute on function public.talk_reply_offset(uuid,uuid) to anon,authenticated;
commit;
