begin;
alter table public.talk_topics add column if not exists edited_at timestamptz;
alter table public.talk_replies add column if not exists edited_at timestamptz;
create or replace function public.talk_edit_post(input_id uuid,is_topic boolean,input_body text,input_spoilers boolean,input_title text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.talk_topics; r public.talk_replies;
begin
 if auth.uid() is null then raise exception 'Log in om te bewerken.'; end if;
 if input_body is null or char_length(btrim(input_body)) not between 1 and 8000 or input_spoilers is null then raise exception 'Ongeldig bericht.'; end if;
 if is_topic then
  select * into t from public.talk_topics where id=input_id for update;
  if not found or t.author_id<>auth.uid() or t.is_hidden or t.is_closed then raise exception 'Je kunt dit bericht niet bewerken.'; end if;
  if input_title is null or char_length(btrim(input_title)) not between 3 and 160 then raise exception 'Ongeldige titel.'; end if;
  update public.talk_topics set body=btrim(input_body),title=btrim(input_title),contains_spoilers=input_spoilers,edited_at=now() where id=input_id;
 else
  select * into r from public.talk_replies where id=input_id;
  if not found or r.author_id<>auth.uid() or r.is_hidden then raise exception 'Je kunt dit bericht niet bewerken.'; end if;
  select * into t from public.talk_topics where id=r.topic_id for share;
  if not found or t.is_hidden or t.is_closed then raise exception 'Dit topic is gesloten of niet beschikbaar.'; end if;
  update public.talk_replies set body=btrim(input_body),contains_spoilers=input_spoilers,edited_at=now() where id=input_id and author_id=auth.uid() and not is_hidden;
  if not found then raise exception 'Dit bericht is niet meer beschikbaar.'; end if;
 end if;
end $$;
revoke all on function public.talk_edit_post(uuid,boolean,text,boolean,text) from public;
grant execute on function public.talk_edit_post(uuid,boolean,text,boolean,text) to authenticated;
commit;
