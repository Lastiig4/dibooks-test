-- DiBooks - Moderation Alert Resolution
-- Uitvoeren NA Moderation Core + DeepSeek Node Moderation.

alter table public.moderation_flags
  add column if not exists resolution text not null default 'pending';

alter table public.moderation_flags
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.moderation_flags
  add column if not exists reviewed_at timestamptz;

alter table public.moderation_flags
  add column if not exists review_note text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'moderation_flags_resolution_check'
      and conrelid = 'public.moderation_flags'::regclass
  ) then
    alter table public.moderation_flags
      add constraint moderation_flags_resolution_check
      check (resolution in ('pending','cleared'));
  end if;
end
$$;

create or replace function public.clear_moderation_flag(
  input_flag_id uuid,
  input_note text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewer_id uuid := auth.uid();
  flag_row public.moderation_flags%rowtype;
  submission_status text;
begin
  if not public.is_current_dibooks_admin() then
    raise exception 'Alleen admins kunnen een moderatiemelding afhandelen.';
  end if;

  select *
    into flag_row
  from public.moderation_flags f
  where f.id = input_flag_id
  for update;

  if not found then
    raise exception 'Moderatiemelding niet gevonden.';
  end if;

  select s.status
    into submission_status
  from public.moderation_submissions s
  where s.id = flag_row.submission_id;

  if submission_status <> 'pending' then
    raise exception 'Deze review is al afgerond.';
  end if;

  if flag_row.severity = 'high'
     and length(btrim(coalesce(input_note,''))) = 0 then
    raise exception 'Bij een ernstige melding is een motivatie verplicht.';
  end if;

  update public.moderation_flags
  set resolution = 'cleared',
      reviewed_by = reviewer_id,
      reviewed_at = now(),
      review_note = left(btrim(coalesce(input_note,'')), 1200)
  where id = flag_row.id;

  return true;
end;
$$;

revoke all on function public.clear_moderation_flag(uuid, text) from public;
grant execute on function public.clear_moderation_flag(uuid, text) to authenticated;


-- Admin review-detail: voeg persisted resolution-data per flag toe.
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
  if not public.is_current_dibooks_admin() then
    raise exception 'Alleen admins hebben toegang.';
  end if;

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
    case
      when jsonb_typeof(s.snapshot->'projectData'->'nodes') = 'array'
        then jsonb_array_length(s.snapshot->'projectData'->'nodes')
      else 0
    end,
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
        'resolution', f.resolution,
        'reviewed_by', f.reviewed_by,
        'reviewed_at', f.reviewed_at,
        'review_note', f.review_note,
        'created_at', f.created_at
      ) order by
        case when f.severity = 'high' then 0 else 1 end,
        f.created_at asc)
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


-- Database-side blokkade:
-- goedkeuren kan pas als ALLE moderatiemeldingen expliciet zijn afgehandeld.
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
  unresolved_flags integer;
begin
  if not public.is_current_dibooks_admin() then
    raise exception 'Alleen admins kunnen een review afronden.';
  end if;

  if input_decision not in ('approved','rejected') then
    raise exception 'Ongeldige moderatiebeslissing.';
  end if;

  if input_decision = 'rejected'
     and length(btrim(coalesce(input_feedback,''))) = 0 then
    raise exception 'Feedback is verplicht bij afwijzen.';
  end if;

  select *
    into submission_row
  from public.moderation_submissions s
  where s.id = input_submission_id
  for update;

  if not found then
    raise exception 'Moderatie-inzending niet gevonden.';
  end if;

  if submission_row.status <> 'pending' then
    raise exception 'Deze inzending is al verwerkt.';
  end if;

  if input_decision = 'approved' then
    select count(*)
      into unresolved_flags
    from public.moderation_flags f
    where f.submission_id = submission_row.id
      and coalesce(f.resolution, 'pending') <> 'cleared';

    if unresolved_flags > 0 then
      raise exception 'Nog % moderatiemelding(en) niet afgehandeld.', unresolved_flags;
    end if;
  end if;

  book_json := submission_row.snapshot->'book';
  project_json := submission_row.snapshot->'projectData';
  project_version := coalesce(
    (submission_row.snapshot->>'projectVersion')::integer,
    (project_json->>'version')::integer,
    1
  );

  insert into public.moderation_reviews (
    submission_id,
    reviewer_id,
    decision,
    feedback
  )
  values (
    submission_row.id,
    reviewer_id,
    input_decision,
    coalesce(input_feedback,'')
  );

  if input_decision = 'approved' then
    update public.books b
    set title = coalesce(book_json->>'title', b.title),
        author = coalesce(book_json->>'author', b.author),
        subtitle = coalesce(book_json->>'subtitle', b.subtitle),
        description = coalesce(book_json->>'description', b.description),
        genres = case
          when jsonb_typeof(book_json->'genres') = 'array'
            then array(select jsonb_array_elements_text(book_json->'genres'))
          else b.genres
        end,
        primary_genre = coalesce(book_json->>'primary_genre', b.primary_genre),
        age_rating = coalesce(book_json->>'age_rating', b.age_rating),
        read_time = coalesce(book_json->>'read_time', b.read_time),
        cover_image = coalesce(book_json->>'cover_image', b.cover_image),
        banner_image = coalesce(book_json->>'banner_image', b.banner_image),
        cover_class = coalesce(book_json->>'cover_class', b.cover_class),
        accent_class = coalesce(book_json->>'accent_class', b.accent_class),
        color_theme = coalesce(book_json->>'color_theme', b.color_theme),
        access_type = coalesce(book_json->>'access_type', b.access_type),
        series_id = case
          when nullif(book_json->>'series_id','') is null then null
          else (book_json->>'series_id')::uuid
        end,
        series_order = case
          when nullif(book_json->>'series_order','') is null then null
          else (book_json->>'series_order')::integer
        end,
        published = true,
        status = 'Testversie',
        published_at = now(),
        removed_from_library_at = null,
        moderation_status = 'approved',
        moderation_feedback = null,
        moderation_updated_at = now(),
        updated_at = now()
    where b.id = submission_row.book_id;

    insert into public.book_projects (
      book_id,
      owner_id,
      project_data,
      version
    )
    values (
      submission_row.book_id,
      submission_row.owner_id,
      project_json,
      project_version
    )
    on conflict (book_id) do update
      set project_data = excluded.project_data,
          version = excluded.version;

    update public.moderation_submissions
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = reviewer_id,
        review_feedback = null
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
      jsonb_build_object(
        'book_id', submission_row.book_id,
        'submission_id', submission_row.id,
        'status', 'approved'
      )
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
    set status = 'rejected',
        reviewed_at = now(),
        reviewed_by = reviewer_id,
        review_feedback = btrim(input_feedback)
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
      jsonb_build_object(
        'book_id', submission_row.book_id,
        'submission_id', submission_row.id,
        'status', 'rejected'
      )
    );
  end if;

  return true;
end;
$$;

revoke all on function public.review_moderation_submission(uuid, text, text) from public;
grant execute on function public.review_moderation_submission(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
