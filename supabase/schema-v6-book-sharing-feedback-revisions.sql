-- DiBooks book sharing, feedback and edit proposals v1

create table if not exists public.book_shares (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  shared_with_user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null default 'read',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, shared_with_user_id)
);

alter table public.book_shares drop constraint if exists book_shares_permission_check;
alter table public.book_shares add constraint book_shares_permission_check check (permission in ('read','comment','edit'));
alter table public.book_shares drop constraint if exists book_shares_status_check;
alter table public.book_shares add constraint book_shares_status_check check (status in ('active','revoked'));

create table if not exists public.book_feedback (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  node_id text,
  page_index integer,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.book_feedback drop constraint if exists book_feedback_status_check;
alter table public.book_feedback add constraint book_feedback_status_check check (status in ('open','seen','closed'));

create table if not exists public.book_revisions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  editor_user_id uuid not null references public.profiles(id) on delete cascade,
  project_data jsonb not null,
  note text,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.book_revisions drop constraint if exists book_revisions_status_check;
alter table public.book_revisions add constraint book_revisions_status_check check (status in ('submitted','accepted','rejected'));

alter table public.book_shares enable row level security;
alter table public.book_feedback enable row level security;
alter table public.book_revisions enable row level security;

drop policy if exists "Users can see related book shares" on public.book_shares;
create policy "Users can see related book shares" on public.book_shares
for select to authenticated
using (owner_id = auth.uid() or shared_with_user_id = auth.uid());

drop policy if exists "Owners can manage own book shares" on public.book_shares;
create policy "Owners can manage own book shares" on public.book_shares
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Users can see related book feedback" on public.book_feedback;
create policy "Users can see related book feedback" on public.book_feedback
for select to authenticated
using (owner_id = auth.uid() or from_user_id = auth.uid());

drop policy if exists "Shared users can insert feedback" on public.book_feedback;
create policy "Shared users can insert feedback" on public.book_feedback
for insert to authenticated
with check (from_user_id = auth.uid());

drop policy if exists "Users can see related book revisions" on public.book_revisions;
create policy "Users can see related book revisions" on public.book_revisions
for select to authenticated
using (owner_id = auth.uid() or editor_user_id = auth.uid());

drop policy if exists "Shared users can insert revisions" on public.book_revisions;
create policy "Shared users can insert revisions" on public.book_revisions
for insert to authenticated
with check (editor_user_id = auth.uid());

drop function if exists public.get_shareable_contacts();
create function public.get_shareable_contacts()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  plan text
)
language sql
security definer
set search_path = public
as $$
  with contacts as (
    select case when c.requester_id = auth.uid() then c.receiver_id else c.requester_id end as contact_id
    from public.user_connections c
    where c.status = 'accepted'
      and (c.requester_id = auth.uid() or c.receiver_id = auth.uid())
  )
  select p.id, p.email, p.display_name, p.role::text, p.plan::text
  from contacts c
  join public.profiles p on p.id = c.contact_id
  order by coalesce(p.display_name, p.email);
$$;

grant execute on function public.get_shareable_contacts() to authenticated;

drop function if exists public.share_book_with_user(uuid, uuid, text);
create function public.share_book_with_user(input_book_id uuid, target_user_id uuid, input_permission text default 'read')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_share_id uuid;
  normalized_permission text := coalesce(input_permission, 'read');
begin
  if auth.uid() is null then
    raise exception 'Login nodig.';
  end if;

  if normalized_permission not in ('read','comment','edit') then
    raise exception 'Ongeldige permissie.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Je kunt een boek niet met jezelf delen.';
  end if;

  if not exists (select 1 from public.books where id = input_book_id and owner_id = auth.uid()) then
    raise exception 'Alleen de eigenaar kan dit boek delen.';
  end if;

  if not exists (
    select 1 from public.user_connections c
    where c.status = 'accepted'
      and ((c.requester_id = auth.uid() and c.receiver_id = target_user_id)
        or (c.receiver_id = auth.uid() and c.requester_id = target_user_id))
  ) then
    raise exception 'Je kunt alleen delen met geaccepteerde contacten.';
  end if;

  insert into public.book_shares (book_id, owner_id, shared_with_user_id, permission, status, updated_at)
  values (input_book_id, auth.uid(), target_user_id, normalized_permission, 'active', now())
  on conflict (book_id, shared_with_user_id)
  do update set permission = excluded.permission, status = 'active', updated_at = now()
  returning id into new_share_id;

  return new_share_id;
end;
$$;

grant execute on function public.share_book_with_user(uuid, uuid, text) to authenticated;

drop function if exists public.revoke_book_share(uuid);
create function public.revoke_book_share(input_share_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.book_shares
  set status = 'revoked', updated_at = now()
  where id = input_share_id and owner_id = auth.uid();
  return found;
end;
$$;

grant execute on function public.revoke_book_share(uuid) to authenticated;

drop function if exists public.get_book_shares_for_owner();
create function public.get_book_shares_for_owner()
returns table (
  share_id uuid,
  book_id uuid,
  book_title text,
  shared_with_user_id uuid,
  shared_with_email text,
  shared_with_display_name text,
  permission text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.book_id, b.title, s.shared_with_user_id, p.email, p.display_name, s.permission, s.status, s.created_at, s.updated_at
  from public.book_shares s
  join public.books b on b.id = s.book_id
  join public.profiles p on p.id = s.shared_with_user_id
  where s.owner_id = auth.uid()
  order by s.updated_at desc;
$$;

grant execute on function public.get_book_shares_for_owner() to authenticated;

drop function if exists public.get_shared_books();
create function public.get_shared_books()
returns table (
  share_id uuid,
  permission text,
  share_status text,
  shared_at timestamptz,
  id uuid,
  slug text,
  title text,
  author text,
  subtitle text,
  description text,
  genres text[],
  primary_genre text,
  status text,
  published boolean,
  access_type text,
  age_rating text,
  read_time text,
  cover_image text,
  banner_image text,
  cover_class text,
  accent_class text,
  owner_id uuid,
  owner_name text,
  owner_email text,
  project_data jsonb,
  project_updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    s.id, s.permission, s.status, s.created_at,
    b.id, b.slug, b.title, b.author, b.subtitle, b.description, b.genres, b.primary_genre,
    b.status, b.published, b.access_type, b.age_rating, b.read_time, b.cover_image, b.banner_image,
    b.cover_class, b.accent_class, b.owner_id,
    owner_profile.display_name as owner_name, owner_profile.email as owner_email,
    bp.project_data, bp.updated_at as project_updated_at
  from public.book_shares s
  join public.books b on b.id = s.book_id
  left join public.book_projects bp on bp.book_id = b.id
  left join public.profiles owner_profile on owner_profile.id = b.owner_id
  where s.shared_with_user_id = auth.uid()
    and s.status = 'active'
  order by s.updated_at desc;
$$;

grant execute on function public.get_shared_books() to authenticated;

drop function if exists public.get_shared_book(input_book_id uuid);
create function public.get_shared_book(input_book_id uuid)
returns table (
  share_id uuid,
  permission text,
  id uuid,
  title text,
  author text,
  subtitle text,
  genres text[],
  primary_genre text,
  status text,
  published boolean,
  access_type text,
  age_rating text,
  read_time text,
  cover_image text,
  banner_image text,
  cover_class text,
  accent_class text,
  owner_id uuid,
  owner_name text,
  owner_email text,
  project_data jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    s.id, s.permission,
    b.id, b.title, b.author, b.subtitle, b.genres, b.primary_genre, b.status, b.published, b.access_type,
    b.age_rating, b.read_time, b.cover_image, b.banner_image, b.cover_class, b.accent_class, b.owner_id,
    owner_profile.display_name, owner_profile.email, bp.project_data
  from public.book_shares s
  join public.books b on b.id = s.book_id
  left join public.book_projects bp on bp.book_id = b.id
  left join public.profiles owner_profile on owner_profile.id = b.owner_id
  where s.shared_with_user_id = auth.uid()
    and s.status = 'active'
    and b.id = input_book_id
  limit 1;
$$;

grant execute on function public.get_shared_book(uuid) to authenticated;

drop function if exists public.submit_book_feedback(uuid, text, text, integer);
create function public.submit_book_feedback(input_book_id uuid, input_message text, input_node_id text default null, input_page_index integer default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner uuid;
  new_feedback_id uuid;
begin
  if auth.uid() is null then raise exception 'Login nodig.'; end if;
  if length(trim(coalesce(input_message, ''))) < 2 then raise exception 'Feedback is leeg.'; end if;

  select b.owner_id into target_owner
  from public.books b
  where b.id = input_book_id
    and (
      b.owner_id = auth.uid()
      or exists (
        select 1 from public.book_shares s
        where s.book_id = b.id and s.shared_with_user_id = auth.uid() and s.status = 'active' and s.permission in ('comment','edit')
      )
    );

  if target_owner is null then raise exception 'Geen toegang om feedback te sturen.'; end if;

  insert into public.book_feedback (book_id, from_user_id, owner_id, message, node_id, page_index)
  values (input_book_id, auth.uid(), target_owner, trim(input_message), input_node_id, input_page_index)
  returning id into new_feedback_id;

  return new_feedback_id;
end;
$$;

grant execute on function public.submit_book_feedback(uuid, text, text, integer) to authenticated;

drop function if exists public.get_book_feedback_for_user();
create function public.get_book_feedback_for_user()
returns table (
  feedback_id uuid,
  book_id uuid,
  book_title text,
  from_user_id uuid,
  from_email text,
  from_display_name text,
  owner_id uuid,
  message text,
  node_id text,
  page_index integer,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select f.id, f.book_id, b.title, f.from_user_id, p.email, p.display_name, f.owner_id, f.message, f.node_id, f.page_index, f.status, f.created_at
  from public.book_feedback f
  join public.books b on b.id = f.book_id
  join public.profiles p on p.id = f.from_user_id
  where f.owner_id = auth.uid() or f.from_user_id = auth.uid()
  order by f.created_at desc;
$$;

grant execute on function public.get_book_feedback_for_user() to authenticated;

drop function if exists public.submit_book_revision(uuid, jsonb, text);
create function public.submit_book_revision(input_book_id uuid, input_project_data jsonb, input_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner uuid;
  new_revision_id uuid;
begin
  if auth.uid() is null then raise exception 'Login nodig.'; end if;

  select b.owner_id into target_owner
  from public.books b
  where b.id = input_book_id
    and exists (
      select 1 from public.book_shares s
      where s.book_id = b.id and s.shared_with_user_id = auth.uid() and s.status = 'active' and s.permission = 'edit'
    );

  if target_owner is null then raise exception 'Geen toegang om een bewerkingsvoorstel te sturen.'; end if;

  insert into public.book_revisions (book_id, owner_id, editor_user_id, project_data, note)
  values (input_book_id, target_owner, auth.uid(), input_project_data, nullif(trim(coalesce(input_note, '')), ''))
  returning id into new_revision_id;

  return new_revision_id;
end;
$$;

grant execute on function public.submit_book_revision(uuid, jsonb, text) to authenticated;

drop function if exists public.get_book_revisions_for_user();
create function public.get_book_revisions_for_user()
returns table (
  revision_id uuid,
  book_id uuid,
  book_title text,
  owner_id uuid,
  editor_user_id uuid,
  editor_email text,
  editor_display_name text,
  note text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.book_id, b.title, r.owner_id, r.editor_user_id, p.email, p.display_name, r.note, r.status, r.created_at, r.updated_at
  from public.book_revisions r
  join public.books b on b.id = r.book_id
  join public.profiles p on p.id = r.editor_user_id
  where r.owner_id = auth.uid() or r.editor_user_id = auth.uid()
  order by r.created_at desc;
$$;

grant execute on function public.get_book_revisions_for_user() to authenticated;

drop function if exists public.respond_to_book_revision(uuid, text);
create function public.respond_to_book_revision(input_revision_id uuid, input_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  revision_row public.book_revisions%rowtype;
begin
  if input_status not in ('accepted','rejected') then raise exception 'Ongeldige status.'; end if;

  select * into revision_row
  from public.book_revisions
  where id = input_revision_id and owner_id = auth.uid();

  if revision_row.id is null then return false; end if;

  if input_status = 'accepted' then
    insert into public.book_projects (book_id, owner_id, project_data, version, updated_at)
    values (revision_row.book_id, revision_row.owner_id, revision_row.project_data, coalesce((revision_row.project_data->>'version')::integer, 1), now())
    on conflict (book_id)
    do update set project_data = excluded.project_data, version = excluded.version, updated_at = now();

    update public.books set updated_at = now(), published = false, status = 'Concept' where id = revision_row.book_id and owner_id = auth.uid();
  end if;

  update public.book_revisions
  set status = input_status, updated_at = now()
  where id = input_revision_id and owner_id = auth.uid();

  return true;
end;
$$;

grant execute on function public.respond_to_book_revision(uuid, text) to authenticated;

notify pgrst, 'reload schema';
select 'book sharing feedback revisions ready' as status;

-- Shared books should also be readable/testable by owner or active shared users.
create or replace function public.can_read_book(target_book_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.books b
    left join public.profiles p on p.id = auth.uid()
    where b.id = target_book_id
      and auth.uid() is not null
      and (
        b.owner_id = auth.uid()
        or exists (
          select 1 from public.book_shares s
          where s.book_id = b.id and s.shared_with_user_id = auth.uid() and s.status = 'active'
        )
        or (
          b.published = true
          and (
            b.access_type = 'free'
            or p.role = 'admin'
            or p.plan in ('reader_plus', 'author_pro')
          )
        )
      )
  );
$$;

grant execute on function public.can_read_book(uuid) to anon, authenticated;

drop function if exists public.get_reader_book(uuid);
create function public.get_reader_book(input_book_id uuid)
returns table (
  id uuid,
  slug text,
  title text,
  author text,
  subtitle text,
  description text,
  genres text[],
  primary_genre text,
  status text,
  published boolean,
  access_type text,
  age_rating text,
  read_time text,
  cover_image text,
  banner_image text,
  project_data jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    b.id,
    b.slug,
    b.title,
    b.author,
    b.subtitle,
    b.description,
    b.genres,
    b.primary_genre,
    b.status,
    b.published,
    b.access_type,
    b.age_rating,
    b.read_time,
    b.cover_image,
    b.banner_image,
    bp.project_data
  from public.books b
  join public.book_projects bp on bp.book_id = b.id
  left join public.profiles p on p.id = auth.uid()
  where b.id = input_book_id
    and auth.uid() is not null
    and (
      b.owner_id = auth.uid()
      or exists (
        select 1 from public.book_shares s
        where s.book_id = b.id and s.shared_with_user_id = auth.uid() and s.status = 'active'
      )
      or (
        b.published = true
        and (
          b.access_type = 'free'
          or p.role = 'admin'
          or p.plan in ('reader_plus', 'author_pro')
        )
      )
    )
  limit 1;
$$;

grant execute on function public.get_reader_book(uuid) to authenticated;

notify pgrst, 'reload schema';
select 'book sharing feedback revisions ready' as status;
