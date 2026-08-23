-- DiBooks Moderation Incremental V5
-- Vereist: Moderation Core + DeepSeek Node Moderation + Review Modal V4.
--
-- Doelen:
-- 1. Nieuwe submission heeft altijd eigen, schone scanstatus.
-- 2. Een boek kan niet worden goedgekeurd zonder afgeronde AI-scan.
-- 3. Ongewijzigde nodes worden bij herindienen NIET opnieuw door DeepSeek gestuurd.
-- 4. Flags van ongewijzigde nodes worden naar de nieuwe submission gekopieerd
--    als NIEUWE open reviewmeldingen.
-- 5. Gewijzigde/nieuwe nodes worden opnieuw gescand.
-- 6. Oude submission-flags kunnen nooit een nieuwe submission blokkeren.

alter table public.moderation_submissions
  add column if not exists ai_scan_status text not null default 'not_started';

alter table public.moderation_submissions
  add column if not exists ai_scan_provider text;

alter table public.moderation_submissions
  add column if not exists ai_scan_model text;

alter table public.moderation_submissions
  add column if not exists ai_scan_started_at timestamptz;

alter table public.moderation_submissions
  add column if not exists ai_scanned_at timestamptz;

alter table public.moderation_submissions
  add column if not exists ai_scan_error text;

alter table public.moderation_submissions
  add column if not exists ai_scanned_node_count integer not null default 0;

alter table public.moderation_submissions
  add column if not exists ai_reused_node_count integer not null default 0;

alter table public.moderation_submissions
  add column if not exists ai_changed_node_count integer not null default 0;

alter table public.moderation_submissions
  add column if not exists ai_total_node_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'moderation_submissions_ai_scan_status_check'
      and conrelid = 'public.moderation_submissions'::regclass
  ) then
    alter table public.moderation_submissions
      add constraint moderation_submissions_ai_scan_status_check
      check (ai_scan_status in ('not_started','running','completed','failed'));
  end if;
end
$$;

-- Historische submissions met echte automatische flags zijn aantoonbaar
-- door een scanner gegaan en mogen als completed cache dienen.
update public.moderation_submissions s
set ai_scan_status = 'completed',
    ai_scan_provider = coalesce(ai_scan_provider, 'deepseek'),
    ai_scan_model = coalesce(ai_scan_model, 'historical'),
    ai_scanned_at = coalesce(ai_scanned_at, s.reviewed_at, s.updated_at, s.submitted_at),
    ai_total_node_count = case
      when jsonb_typeof(s.snapshot->'projectData'->'nodes') = 'array'
        then jsonb_array_length(s.snapshot->'projectData'->'nodes')
      else 0
    end
where s.ai_scan_status = 'not_started'
  and exists (
    select 1
    from public.moderation_flags f
    where f.submission_id = s.id
      and f.source in ('openai','deepseek')
  );


create or replace function public.begin_incremental_moderation_scan(
  input_submission_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  submission_owner uuid;
  submission_status text;
begin
  if caller_id is null then raise exception 'Login vereist.'; end if;

  select s.owner_id, s.status
    into submission_owner, submission_status
  from public.moderation_submissions s
  where s.id = input_submission_id;

  if not found then raise exception 'Reviewinzending niet gevonden.'; end if;

  if caller_id <> submission_owner and not public.is_current_dibooks_admin() then
    raise exception 'Geen toegang tot deze reviewinzending.';
  end if;

  if submission_status <> 'pending' then
    raise exception 'Alleen een pending inzending kan worden gescand.';
  end if;

  update public.moderation_submissions
  set ai_scan_status = 'running',
      ai_scan_provider = 'deepseek',
      ai_scan_model = 'deepseek-v4-flash',
      ai_scan_started_at = now(),
      ai_scanned_at = null,
      ai_scan_error = null,
      ai_scanned_node_count = 0,
      ai_reused_node_count = 0,
      ai_changed_node_count = 0,
      ai_total_node_count = 0
  where id = input_submission_id;

  return true;
end;
$$;

revoke all on function public.begin_incremental_moderation_scan(uuid) from public;
grant execute on function public.begin_incremental_moderation_scan(uuid) to authenticated;


create or replace function public.get_previous_completed_moderation_context(
  input_submission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  current_row public.moderation_submissions%rowtype;
  previous_row public.moderation_submissions%rowtype;
  previous_flags jsonb := '[]'::jsonb;
begin
  if caller_id is null then raise exception 'Login vereist.'; end if;

  select *
    into current_row
  from public.moderation_submissions s
  where s.id = input_submission_id;

  if not found then raise exception 'Reviewinzending niet gevonden.'; end if;

  if caller_id <> current_row.owner_id and not public.is_current_dibooks_admin() then
    raise exception 'Geen toegang tot deze reviewinzending.';
  end if;

  select *
    into previous_row
  from public.moderation_submissions s
  where s.book_id = current_row.book_id
    and s.id <> current_row.id
    and s.ai_scan_status = 'completed'
    and s.submitted_at < current_row.submitted_at
  order by s.submitted_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'previous_submission_id', null,
      'previous_snapshot', null,
      'previous_flags', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'node_id', f.node_id,
        'category', f.category,
        'severity', f.severity,
        'reason', f.reason,
        'source', f.source
      )
      order by f.created_at asc
    ),
    '[]'::jsonb
  )
  into previous_flags
  from public.moderation_flags f
  where f.submission_id = previous_row.id
    and f.source in ('openai','deepseek');

  return jsonb_build_object(
    'previous_submission_id', previous_row.id,
    'previous_snapshot', previous_row.snapshot,
    'previous_flags', previous_flags
  );
end;
$$;

revoke all on function public.get_previous_completed_moderation_context(uuid) from public;
grant execute on function public.get_previous_completed_moderation_context(uuid) to authenticated;


create or replace function public.complete_incremental_moderation_scan(
  input_submission_id uuid,
  input_flags jsonb,
  input_scanned_node_count integer,
  input_reused_node_count integer,
  input_total_node_count integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  submission_owner uuid;
  submission_status text;
  item jsonb;
  normalized_severity text;
  inserted_count integer := 0;
begin
  if caller_id is null then raise exception 'Login vereist.'; end if;

  select s.owner_id, s.status
    into submission_owner, submission_status
  from public.moderation_submissions s
  where s.id = input_submission_id
  for update;

  if not found then raise exception 'Reviewinzending niet gevonden.'; end if;

  if caller_id <> submission_owner and not public.is_current_dibooks_admin() then
    raise exception 'Geen toegang tot deze reviewinzending.';
  end if;

  if submission_status <> 'pending' then
    raise exception 'Alleen een pending inzending kan worden gescand.';
  end if;

  if jsonb_typeof(coalesce(input_flags, '[]'::jsonb)) <> 'array' then
    raise exception 'input_flags moet een JSON-array zijn.';
  end if;

  -- Alleen automatische flags van DEZE submission vervangen.
  -- Historische submissions en handmatige adminflags blijven onaangetast.
  delete from public.moderation_flags
  where submission_id = input_submission_id
    and source in ('openai','deepseek');

  for item in
    select value
    from jsonb_array_elements(coalesce(input_flags, '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(item->>'node_id', '')), '') is null then
      continue;
    end if;

    normalized_severity := lower(coalesce(item->>'severity', 'medium'));
    if normalized_severity not in ('low','medium','high') then
      normalized_severity := 'medium';
    end if;

    insert into public.moderation_flags (
      submission_id,
      node_id,
      category,
      severity,
      reason,
      source,
      resolution,
      reviewed_by,
      reviewed_at,
      review_note
    )
    values (
      input_submission_id,
      item->>'node_id',
      left(coalesce(nullif(btrim(item->>'category'), ''), 'Automatische controle'), 160),
      normalized_severity,
      left(coalesce(nullif(btrim(item->>'reason'), ''), 'Automatische scan vraagt menselijke controle.'), 1200),
      'deepseek',
      'pending',
      null,
      null,
      ''
    );

    inserted_count := inserted_count + 1;
  end loop;

  update public.moderation_submissions
  set ai_scan_status = 'completed',
      ai_scan_provider = 'deepseek',
      ai_scan_model = 'deepseek-v4-flash',
      ai_scanned_at = now(),
      ai_scan_error = null,
      ai_scanned_node_count = greatest(0, coalesce(input_scanned_node_count, 0)),
      ai_reused_node_count = greatest(0, coalesce(input_reused_node_count, 0)),
      ai_changed_node_count = greatest(0, coalesce(input_scanned_node_count, 0)),
      ai_total_node_count = greatest(0, coalesce(input_total_node_count, 0))
  where id = input_submission_id;

  return inserted_count;
end;
$$;

revoke all on function public.complete_incremental_moderation_scan(uuid, jsonb, integer, integer, integer) from public;
grant execute on function public.complete_incremental_moderation_scan(uuid, jsonb, integer, integer, integer) to authenticated;


create or replace function public.fail_incremental_moderation_scan(
  input_submission_id uuid,
  input_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  submission_owner uuid;
begin
  if caller_id is null then raise exception 'Login vereist.'; end if;

  select s.owner_id
    into submission_owner
  from public.moderation_submissions s
  where s.id = input_submission_id;

  if not found then raise exception 'Reviewinzending niet gevonden.'; end if;

  if caller_id <> submission_owner and not public.is_current_dibooks_admin() then
    raise exception 'Geen toegang tot deze reviewinzending.';
  end if;

  update public.moderation_submissions
  set ai_scan_status = 'failed',
      ai_scan_error = left(coalesce(input_error, 'Onbekende scannerfout'), 1200),
      ai_scanned_at = null
  where id = input_submission_id
    and status = 'pending';

  return true;
end;
$$;

revoke all on function public.fail_incremental_moderation_scan(uuid, text) from public;
grant execute on function public.fail_incremental_moderation_scan(uuid, text) to authenticated;


-- ============================================================
-- Admin queue met expliciete scanstatus + reviewernaam.
-- ============================================================

drop function if exists public.get_admin_moderation_queue();

create function public.get_admin_moderation_queue()
returns table (
  submission_id uuid,
  book_id uuid,
  owner_id uuid,
  status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_feedback text,
  reviewer_name text,
  reviewer_email text,
  ai_scan_status text,
  ai_scan_provider text,
  ai_scan_model text,
  ai_scan_started_at timestamptz,
  ai_scanned_at timestamptz,
  ai_scan_error text,
  ai_scanned_node_count integer,
  ai_reused_node_count integer,
  ai_changed_node_count integer,
  ai_total_node_count integer,
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
    case when s.reviewed_by is null then null
      else coalesce(reviewer_profile.display_name, reviewer_profile.email, 'Admin')
    end,
    case when s.reviewed_by is null then null
      else coalesce(reviewer_profile.email, '')
    end,
    s.ai_scan_status,
    s.ai_scan_provider,
    s.ai_scan_model,
    s.ai_scan_started_at,
    s.ai_scanned_at,
    s.ai_scan_error,
    s.ai_scanned_node_count,
    s.ai_reused_node_count,
    s.ai_changed_node_count,
    s.ai_total_node_count,
    coalesce(s.snapshot->'book'->>'title', 'Ongetiteld boek'),
    coalesce(s.snapshot->'book'->>'author', 'Auteur'),
    coalesce(owner_profile.display_name, owner_profile.email, 'Auteur'),
    coalesce(owner_profile.email, ''),
    coalesce(s.snapshot->'book'->>'cover_image', ''),
    case
      when jsonb_typeof(s.snapshot->'projectData'->'nodes') = 'array'
        then jsonb_array_length(s.snapshot->'projectData'->'nodes')
      else 0
    end,
    (select count(*) from public.moderation_flags f where f.submission_id = s.id)
  from public.moderation_submissions s
  left join public.profiles owner_profile on owner_profile.id = s.owner_id
  left join public.profiles reviewer_profile on reviewer_profile.id = s.reviewed_by
  order by
    case when s.status = 'pending' then 0 else 1 end,
    coalesce(s.reviewed_at, s.submitted_at) desc;
end;
$$;

revoke all on function public.get_admin_moderation_queue() from public;
grant execute on function public.get_admin_moderation_queue() to authenticated;


-- ============================================================
-- Review detail met current submission_id per flag.
-- Hierdoor kan de frontend oude lokale flags defensief negeren.
-- ============================================================

drop function if exists public.get_admin_moderation_submission(uuid);

create function public.get_admin_moderation_submission(input_submission_id uuid)
returns table (
  submission_id uuid,
  book_id uuid,
  owner_id uuid,
  status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_feedback text,
  reviewer_name text,
  reviewer_email text,
  ai_scan_status text,
  ai_scan_provider text,
  ai_scan_model text,
  ai_scan_started_at timestamptz,
  ai_scanned_at timestamptz,
  ai_scan_error text,
  ai_scanned_node_count integer,
  ai_reused_node_count integer,
  ai_changed_node_count integer,
  ai_total_node_count integer,
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
    case when s.reviewed_by is null then null
      else coalesce(reviewer_profile.display_name, reviewer_profile.email, 'Admin')
    end,
    case when s.reviewed_by is null then null
      else coalesce(reviewer_profile.email, '')
    end,
    s.ai_scan_status,
    s.ai_scan_provider,
    s.ai_scan_model,
    s.ai_scan_started_at,
    s.ai_scanned_at,
    s.ai_scan_error,
    s.ai_scanned_node_count,
    s.ai_reused_node_count,
    s.ai_changed_node_count,
    s.ai_total_node_count,
    coalesce(s.snapshot->'book'->>'title', 'Ongetiteld boek'),
    coalesce(s.snapshot->'book'->>'author', 'Auteur'),
    coalesce(owner_profile.display_name, owner_profile.email, 'Auteur'),
    coalesce(owner_profile.email, ''),
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
        'submission_id', f.submission_id,
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
  left join public.profiles owner_profile on owner_profile.id = s.owner_id
  left join public.profiles reviewer_profile on reviewer_profile.id = s.reviewed_by
  where s.id = input_submission_id;
end;
$$;

revoke all on function public.get_admin_moderation_submission(uuid) from public;
grant execute on function public.get_admin_moderation_submission(uuid) to authenticated;


-- ============================================================
-- Extra database-gate: approval vereist afgeronde scan.
-- De bestaande V4 reviewfunctie controleert al unresolved flags + high-note.
-- ============================================================

create or replace function public.enforce_completed_ai_scan_before_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scan_status text;
begin
  if new.decision <> 'approved' then
    return new;
  end if;

  select s.ai_scan_status
    into scan_status
  from public.moderation_submissions s
  where s.id = new.submission_id;

  if scan_status is distinct from 'completed' then
    raise exception 'Goedkeuren kan pas nadat de AI-scan van deze inzending succesvol is afgerond.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_require_completed_ai_scan_for_approval
  on public.moderation_reviews;

create trigger trg_require_completed_ai_scan_for_approval
before insert on public.moderation_reviews
for each row
execute function public.enforce_completed_ai_scan_before_approval();

notify pgrst, 'reload schema';
