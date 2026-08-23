-- DiBooks Moderation Core v1
-- Eenmalig uitvoeren in Supabase SQL Editor.
-- Vereist de bestaande DiBooks profiles/books/book_projects + notifications schema's.

alter table public.books add column if not exists moderation_status text not null default 'draft';
alter table public.books add column if not exists moderation_feedback text;
alter table public.books add column if not exists moderation_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'books_moderation_status_check'
      and conrelid = 'public.books'::regclass
  ) then
    alter table public.books
      add constraint books_moderation_status_check
      check (moderation_status in ('draft','pending','approved','rejected'));
  end if;
end $$;

-- Bestaande live boeken dateren van vóór Moderation Core en gelden als reeds goedgekeurd.
update public.books
set moderation_status = 'approved',
    moderation_updated_at = coalesce(moderation_updated_at, published_at, updated_at, now())
where published = true
  and moderation_status = 'draft';

create table if not exists public.moderation_submissions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  snapshot jsonb not null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists moderation_one_pending_per_book_idx
  on public.moderation_submissions(book_id)
  where status = 'pending';
create index if not exists moderation_submissions_status_submitted_idx
  on public.moderation_submissions(status, submitted_at desc);
create index if not exists moderation_submissions_owner_idx
  on public.moderation_submissions(owner_id, submitted_at desc);

create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.moderation_submissions(id) on delete cascade,
  node_id text not null,
  category text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  reason text not null default '',
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index if not exists moderation_flags_submission_node_idx
  on public.moderation_flags(submission_id, node_id);

create table if not exists public.moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.moderation_submissions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected')),
  feedback text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists moderation_reviews_submission_idx
  on public.moderation_reviews(submission_id, created_at desc);

create or replace function public.is_current_dibooks_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'admin'
  );
$$;
revoke all on function public.is_current_dibooks_admin() from public;
grant execute on function public.is_current_dibooks_admin() to authenticated;

alter table public.moderation_submissions enable row level security;
alter table public.moderation_flags enable row level security;
alter table public.moderation_reviews enable row level security;

drop policy if exists "Owners and admins can read moderation submissions" on public.moderation_submissions;
create policy "Owners and admins can read moderation submissions"
on public.moderation_submissions for select to authenticated
using (owner_id = auth.uid() or public.is_current_dibooks_admin());

drop policy if exists "Admins can read moderation flags" on public.moderation_flags;
create policy "Admins can read moderation flags"
on public.moderation_flags for select to authenticated
using (public.is_current_dibooks_admin());

drop policy if exists "Owners and admins can read moderation reviews" on public.moderation_reviews;
create policy "Owners and admins can read moderation reviews"
on public.moderation_reviews for select to authenticated
using (
  public.is_current_dibooks_admin()
  or exists (
    select 1 from public.moderation_submissions s
    where s.id = moderation_reviews.submission_id
      and s.owner_id = auth.uid()
  )
);

-- Snapshot zelf mag nooit worden vervangen nadat hij is ingediend.
create or replace function public.prevent_moderation_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.snapshot is distinct from old.snapshot
     or new.book_id is distinct from old.book_id
     or new.owner_id is distinct from old.owner_id
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'De ingediende review-snapshot is immutable.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_prevent_moderation_snapshot_mutation on public.moderation_submissions;
create trigger trg_prevent_moderation_snapshot_mutation
before update on public.moderation_submissions
for each row execute function public.prevent_moderation_snapshot_mutation();

-- Zolang een boek pending is kan de eigenaar de live draft niet muteren.
-- Admins en service-processen mogen dit wel voor een beslissing/scanner.
create or replace function public.prevent_pending_book_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner uuid;
  target_status text;
  target_book_id uuid;
begin
  if tg_table_name = 'books' then
    target_owner := old.owner_id;
    target_status := old.moderation_status;

    -- Een auteur kan publicatie niet via een rechtstreekse books-update omzeilen.
    -- Alleen een adminbeslissing mag published van false naar true zetten.
    if tg_op = 'UPDATE'
       and coalesce(old.published, false) = false
       and coalesce(new.published, false) = true
       and not public.is_current_dibooks_admin() then
      raise exception 'Publiceren vereist goedkeuring door een DiBooks-admin.';
    end if;

    -- De auteur mag moderation_status niet zelf vervalsen. Twee overgangen zijn
    -- legitiem: submit -> pending (alleen als er echt een pending snapshot is),
    -- en een reeds live boek bewust terughalen -> draft.
    if tg_op = 'UPDATE'
       and auth.uid() = target_owner
       and not public.is_current_dibooks_admin()
       and new.moderation_status is distinct from old.moderation_status then
      if new.moderation_status = 'pending' then
        if not exists (
          select 1 from public.moderation_submissions s
          where s.book_id = old.id and s.status = 'pending'
        ) then
          raise exception 'Ongeldige moderatiestatus: er bestaat geen review-snapshot.';
        end if;
      elsif new.moderation_status = 'draft'
            and coalesce(old.published, false) = true
            and coalesce(new.published, false) = false then
        null; -- bewust uit de Library gehaald; nieuwe versie mag weer bewerkt worden
      else
        raise exception 'Moderatiestatus kan alleen via de DiBooks reviewflow worden gewijzigd.';
      end if;
    end if;
  else
    if tg_op = 'DELETE' then
      target_book_id := old.book_id;
    else
      target_book_id := new.book_id;
    end if;

    select b.owner_id, b.moderation_status
      into target_owner, target_status
    from public.books b
    where b.id = target_book_id;
  end if;

  if target_status = 'pending'
     and auth.uid() = target_owner
     and not public.is_current_dibooks_admin() then
    raise exception 'Dit boek staat in beoordeling en is tijdelijk vergrendeld.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_pending_books_update on public.books;
create trigger trg_prevent_pending_books_update
before update or delete on public.books
for each row execute function public.prevent_pending_book_mutation();

drop trigger if exists trg_prevent_pending_projects_update on public.book_projects;
create trigger trg_prevent_pending_projects_update
before insert or update or delete on public.book_projects
for each row execute function public.prevent_pending_book_mutation();

create or replace function public.submit_book_for_moderation(input_book_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  book_row public.books%rowtype;
  project_row public.book_projects%rowtype;
  caller_role text;
  caller_plan text;
  caller_name text;
  new_submission_id uuid;
  admin_id uuid;
begin
  if caller_id is null then raise exception 'Login nodig.'; end if;

  select p.role::text, p.plan, coalesce(p.display_name, p.email, 'Een auteur')
    into caller_role, caller_plan, caller_name
  from public.profiles p where p.id = caller_id;

  if not (caller_role = 'admin' or (caller_role = 'author' and caller_plan in ('author_pro','member'))) then
    raise exception 'Alleen Author Pro of Admin kan een boek indienen voor publicatie.';
  end if;

  select * into book_row from public.books b where b.id = input_book_id for update;
  if not found then raise exception 'Boek niet gevonden.'; end if;
  if book_row.owner_id <> caller_id and caller_role <> 'admin' then raise exception 'Geen toegang tot dit boek.'; end if;
  if book_row.published then raise exception 'Dit boek staat al live.'; end if;
  if book_row.moderation_status = 'pending' then raise exception 'Dit boek staat al in beoordeling.'; end if;

  select * into project_row from public.book_projects bp where bp.book_id = input_book_id;
  if not found or project_row.project_data is null then raise exception 'Sla het boek eerst op in de Auteur Studio.'; end if;

  insert into public.moderation_submissions (book_id, owner_id, status, snapshot)
  values (
    book_row.id,
    book_row.owner_id,
    'pending',
    jsonb_build_object(
      'book', to_jsonb(book_row),
      'projectData', project_row.project_data,
      'projectVersion', project_row.version,
      'submittedAt', now()
    )
  ) returning id into new_submission_id;

  update public.books
  set moderation_status = 'pending',
      moderation_feedback = null,
      moderation_updated_at = now(),
      published = false,
      status = 'Concept',
      updated_at = now()
  where id = book_row.id;

  for admin_id in
    select p.id from public.profiles p where p.role::text = 'admin'
  loop
    perform public.create_user_notification(
      admin_id,
      caller_id,
      'moderation_submission',
      'Nieuw boek ter beoordeling',
      caller_name || ' heeft "' || coalesce(book_row.title, 'een boek') || '" ingediend voor beoordeling.',
      '/admin/moderation?submission=' || new_submission_id::text,
      'moderation_submission',
      new_submission_id,
      jsonb_build_object('book_id', book_row.id, 'submission_id', new_submission_id)
    );
  end loop;

  return new_submission_id;
end;
$$;
revoke all on function public.submit_book_for_moderation(uuid) from public;
grant execute on function public.submit_book_for_moderation(uuid) to authenticated;

create or replace function public.get_admin_moderation_queue()
returns table (
  submission_id uuid,
  book_id uuid,
  owner_id uuid,
  status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_feedback text,
  book_title text,
  book_author text,
  owner_name text,
  owner_email text,
  cover_image text,
  node_count integer,
  flag_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_current_dibooks_admin() then raise exception 'Alleen admins hebben toegang.'; end if;

  return query
  select
    s.id,
    s.book_id,
    s.owner_id,
    s.status,
    s.submitted_at,
    s.reviewed_at,
    s.review_feedback,
    coalesce(s.snapshot->'book'->>'title', 'Ongetiteld boek'),
    coalesce(s.snapshot->'book'->>'author', 'Auteur'),
    coalesce(p.display_name, p.email, 'Auteur'),
    coalesce(p.email, ''),
    coalesce(s.snapshot->'book'->>'cover_image', ''),
    case when jsonb_typeof(s.snapshot->'projectData'->'nodes') = 'array' then jsonb_array_length(s.snapshot->'projectData'->'nodes') else 0 end,
    (select count(*) from public.moderation_flags f where f.submission_id = s.id)
  from public.moderation_submissions s
  left join public.profiles p on p.id = s.owner_id
  order by case when s.status = 'pending' then 0 else 1 end, s.submitted_at desc;
end;
$$;
revoke all on function public.get_admin_moderation_queue() from public;
grant execute on function public.get_admin_moderation_queue() to authenticated;

create or replace function public.get_admin_moderation_submission(input_submission_id uuid)
returns table (
  submission_id uuid,
  book_id uuid,
  owner_id uuid,
  status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_feedback text,
  book_title text,
  book_author text,
  owner_name text,
  owner_email text,
  cover_image text,
  node_count integer,
  flag_count bigint,
  snapshot jsonb,
  flags jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_current_dibooks_admin() then raise exception 'Alleen admins hebben toegang.'; end if;

  return query
  select
    s.id,
    s.book_id,
    s.owner_id,
    s.status,
    s.submitted_at,
    s.reviewed_at,
    s.review_feedback,
    coalesce(s.snapshot->'book'->>'title', 'Ongetiteld boek'),
    coalesce(s.snapshot->'book'->>'author', 'Auteur'),
    coalesce(p.display_name, p.email, 'Auteur'),
    coalesce(p.email, ''),
    coalesce(s.snapshot->'book'->>'cover_image', ''),
    case when jsonb_typeof(s.snapshot->'projectData'->'nodes') = 'array' then jsonb_array_length(s.snapshot->'projectData'->'nodes') else 0 end,
    (select count(*) from public.moderation_flags f where f.submission_id = s.id),
    s.snapshot,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'flag_id', f.id,
        'node_id', f.node_id,
        'category', f.category,
        'severity', f.severity,
        'reason', f.reason,
        'source', f.source,
        'created_at', f.created_at
      ) order by f.created_at asc)
      from public.moderation_flags f
      where f.submission_id = s.id
    ), '[]'::jsonb)
  from public.moderation_submissions s
  left join public.profiles p on p.id = s.owner_id
  where s.id = input_submission_id;
end;
$$;
revoke all on function public.get_admin_moderation_submission(uuid) from public;
grant execute on function public.get_admin_moderation_submission(uuid) to authenticated;

create or replace function public.review_moderation_submission(
  input_submission_id uuid,
  input_decision text,
  input_feedback text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewer_id uuid := auth.uid();
  submission_row public.moderation_submissions%rowtype;
  book_json jsonb;
  project_json jsonb;
  project_version integer;
  owner_name text;
begin
  if not public.is_current_dibooks_admin() then raise exception 'Alleen admins kunnen een review afronden.'; end if;
  if input_decision not in ('approved','rejected') then raise exception 'Ongeldige moderatiebeslissing.'; end if;
  if input_decision = 'rejected' and length(btrim(coalesce(input_feedback,''))) = 0 then raise exception 'Feedback is verplicht bij afwijzen.'; end if;

  select * into submission_row
  from public.moderation_submissions s
  where s.id = input_submission_id
  for update;

  if not found then raise exception 'Moderatie-inzending niet gevonden.'; end if;
  if submission_row.status <> 'pending' then raise exception 'Deze inzending is al verwerkt.'; end if;

  book_json := submission_row.snapshot->'book';
  project_json := submission_row.snapshot->'projectData';
  project_version := coalesce((submission_row.snapshot->>'projectVersion')::integer, (project_json->>'version')::integer, 1);

  insert into public.moderation_reviews (submission_id, reviewer_id, decision, feedback)
  values (submission_row.id, reviewer_id, input_decision, coalesce(input_feedback,''));

  if input_decision = 'approved' then
    -- Publiceer EXPLICIET de bevroren snapshot; niet een mogelijk later gewijzigde draft.
    update public.books b
    set title = coalesce(book_json->>'title', b.title),
        author = coalesce(book_json->>'author', b.author),
        subtitle = coalesce(book_json->>'subtitle', b.subtitle),
        description = coalesce(book_json->>'description', b.description),
        genres = case when jsonb_typeof(book_json->'genres') = 'array' then array(select jsonb_array_elements_text(book_json->'genres')) else b.genres end,
        primary_genre = coalesce(book_json->>'primary_genre', b.primary_genre),
        age_rating = coalesce(book_json->>'age_rating', b.age_rating),
        read_time = coalesce(book_json->>'read_time', b.read_time),
        cover_image = coalesce(book_json->>'cover_image', b.cover_image),
        banner_image = coalesce(book_json->>'banner_image', b.banner_image),
        cover_class = coalesce(book_json->>'cover_class', b.cover_class),
        accent_class = coalesce(book_json->>'accent_class', b.accent_class),
        color_theme = coalesce(book_json->>'color_theme', b.color_theme),
        access_type = coalesce(book_json->>'access_type', b.access_type),
        series_id = case when nullif(book_json->>'series_id','') is null then null else (book_json->>'series_id')::uuid end,
        series_order = case when nullif(book_json->>'series_order','') is null then null else (book_json->>'series_order')::integer end,
        published = true,
        status = 'Testversie',
        published_at = now(),
        removed_from_library_at = null,
        moderation_status = 'approved',
        moderation_feedback = null,
        moderation_updated_at = now(),
        updated_at = now()
    where b.id = submission_row.book_id;

    insert into public.book_projects (book_id, owner_id, project_data, version)
    values (submission_row.book_id, submission_row.owner_id, project_json, project_version)
    on conflict (book_id) do update
      set project_data = excluded.project_data,
          version = excluded.version;

    update public.moderation_submissions
    set status = 'approved', reviewed_at = now(), reviewed_by = reviewer_id, review_feedback = null
    where id = submission_row.id;

    perform public.create_user_notification(
      submission_row.owner_id,
      reviewer_id,
      'moderation_approved',
      'Boek goedgekeurd',
      'Je boek "' || coalesce(book_json->>'title','') || '" is goedgekeurd en staat nu live in de Library.',
      '/books/' || submission_row.book_id::text,
      'moderation_submission',
      submission_row.id,
      jsonb_build_object('book_id', submission_row.book_id, 'submission_id', submission_row.id, 'status', 'approved')
    );
  else
    update public.books
    set published = false,
        status = 'Concept',
        moderation_status = 'rejected',
        moderation_feedback = btrim(input_feedback),
        moderation_updated_at = now(),
        updated_at = now()
    where id = submission_row.book_id;

    update public.moderation_submissions
    set status = 'rejected', reviewed_at = now(), reviewed_by = reviewer_id, review_feedback = btrim(input_feedback)
    where id = submission_row.id;

    perform public.create_user_notification(
      submission_row.owner_id,
      reviewer_id,
      'moderation_rejected',
      'Boek afgewezen',
      'Je boek "' || coalesce(book_json->>'title','') || '" is afgewezen. Feedback: ' || btrim(input_feedback),
      '/dashboard',
      'moderation_submission',
      submission_row.id,
      jsonb_build_object('book_id', submission_row.book_id, 'submission_id', submission_row.id, 'status', 'rejected')
    );
  end if;

  return true;
end;
$$;
revoke all on function public.review_moderation_submission(uuid, text, text) from public;
grant execute on function public.review_moderation_submission(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
select 'DiBooks Moderation Core ready' as status;
