-- First run BOOK_REVIEWS_V1_SUPABASE.sql, then this migration.
begin;
create table if not exists public.talk_spaces (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 author_name text not null default 'Lezer',
 title text not null check (char_length(btrim(title)) between 3 and 80),
 description text not null default '' check (char_length(description) <= 500),
 created_at timestamptz not null default now()
);
create table if not exists public.talk_topics (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 author_name text not null default 'Lezer',
 space_id uuid references public.talk_spaces(id) on delete set null,
 book_ids uuid[] not null default '{}',
 title text not null check (char_length(btrim(title)) between 3 and 160),
 body text not null check (char_length(btrim(body)) between 1 and 8000),
 contains_spoilers boolean not null default false,
 created_at timestamptz not null default now(),
 check (cardinality(book_ids) <= 5)
);
create table if not exists public.talk_replies (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 author_name text not null default 'Lezer',
 topic_id uuid not null references public.talk_topics(id) on delete cascade,
 body text not null check (char_length(btrim(body)) between 1 and 8000),
 contains_spoilers boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists talk_topics_books on public.talk_topics using gin(book_ids);
create index if not exists talk_topics_space_date on public.talk_topics(space_id, created_at desc);
create index if not exists talk_replies_topic_date on public.talk_replies(topic_id, created_at);

create or replace function public.talk_prepare_post() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Log in om te plaatsen.'; end if;
 new.author_id := auth.uid();
 select coalesce(nullif(btrim(p.display_name), ''), 'Lezer') into new.author_name from public.profiles p where p.id = auth.uid();
 new.author_name := coalesce(new.author_name, 'Lezer');
 new.created_at := now();
 if TG_TABLE_NAME = 'talk_topics' then
   if exists (select 1 from unnest(new.book_ids) as tagged(book_id) where not exists (select 1 from public.books b where b.id = tagged.book_id and b.published)) then
     raise exception 'Je kunt alleen gepubliceerde boeken taggen.';
   end if;
 end if;
 return new;
end $$;
revoke all on function public.talk_prepare_post() from public;
drop trigger if exists talk_prepare on public.talk_spaces;
create trigger talk_prepare before insert on public.talk_spaces for each row execute function public.talk_prepare_post();
drop trigger if exists talk_prepare on public.talk_topics;
create trigger talk_prepare before insert on public.talk_topics for each row execute function public.talk_prepare_post();
drop trigger if exists talk_prepare on public.talk_replies;
create trigger talk_prepare before insert on public.talk_replies for each row execute function public.talk_prepare_post();

alter table public.talk_spaces enable row level security;
alter table public.talk_topics enable row level security;
alter table public.talk_replies enable row level security;
revoke all on public.talk_spaces, public.talk_topics, public.talk_replies from anon, authenticated;
grant select on public.talk_spaces, public.talk_topics, public.talk_replies to anon, authenticated;
grant insert(title,description) on public.talk_spaces to authenticated;
grant insert(space_id,book_ids,title,body,contains_spoilers) on public.talk_topics to authenticated;
grant insert(topic_id,body,contains_spoilers) on public.talk_replies to authenticated;
grant delete on public.talk_spaces, public.talk_topics, public.talk_replies to authenticated;
drop policy if exists talk_spaces_read on public.talk_spaces;
create policy talk_spaces_read on public.talk_spaces for select using (true);
drop policy if exists talk_spaces_write on public.talk_spaces;
create policy talk_spaces_write on public.talk_spaces for insert to authenticated with check (author_id = auth.uid());
drop policy if exists talk_spaces_delete on public.talk_spaces;
create policy talk_spaces_delete on public.talk_spaces for delete to authenticated using (author_id = auth.uid() or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin'));
drop policy if exists talk_topics_read on public.talk_topics;
create policy talk_topics_read on public.talk_topics for select using (true);
drop policy if exists talk_topics_write on public.talk_topics;
create policy talk_topics_write on public.talk_topics for insert to authenticated with check (author_id = auth.uid());
drop policy if exists talk_topics_delete on public.talk_topics;
create policy talk_topics_delete on public.talk_topics for delete to authenticated using (author_id = auth.uid() or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin'));
drop policy if exists talk_replies_read on public.talk_replies;
create policy talk_replies_read on public.talk_replies for select using (true);
drop policy if exists talk_replies_write on public.talk_replies;
create policy talk_replies_write on public.talk_replies for insert to authenticated with check (author_id = auth.uid());
drop policy if exists talk_replies_delete on public.talk_replies;
create policy talk_replies_delete on public.talk_replies for delete to authenticated using (author_id = auth.uid() or exists(select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin'));

-- Only display names, never email addresses or account UUIDs in review feeds.
create or replace function public.talk_book_reviews(input_book_id uuid, page_offset integer default 0)
returns table(review_id text, author_name text, rating smallint, body text, contains_spoilers boolean, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
 select md5(r.book_id::text || ':' || r.user_id::text), coalesce(nullif(btrim(p.display_name),''),'Lezer'), r.rating,
 case when r.contains_spoilers then null else r.body end, r.contains_spoilers, r.created_at
 from public.book_reviews r join public.books b on b.id = r.book_id left join public.profiles p on p.id = r.user_id
 where b.id = input_book_id and b.published
 order by r.created_at desc, r.user_id limit 30 offset greatest(0, least(page_offset,100000));
$$;
create or replace function public.talk_reveal_review(input_book_id uuid, input_review_id text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
 select r.body from public.book_reviews r join public.books b on b.id = r.book_id
 where b.id = input_book_id and b.published and md5(r.book_id::text || ':' || r.user_id::text) = input_review_id;
$$;
revoke all on function public.talk_book_reviews(uuid,integer), public.talk_reveal_review(uuid,text) from public;
grant execute on function public.talk_book_reviews(uuid,integer), public.talk_reveal_review(uuid,text) to anon, authenticated;
commit;
