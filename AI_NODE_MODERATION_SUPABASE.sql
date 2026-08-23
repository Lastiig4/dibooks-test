-- DiBooks - Automatic AI Node Moderation
-- Uitvoeren NA Moderation Core v1.

create or replace function public.replace_auto_moderation_flags(
  input_submission_id uuid,
  input_flags jsonb
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
  if caller_id is null then
    raise exception 'Login vereist.';
  end if;

  select s.owner_id, s.status
    into submission_owner, submission_status
  from public.moderation_submissions s
  where s.id = input_submission_id;

  if not found then
    raise exception 'Reviewinzending niet gevonden.';
  end if;

  if caller_id <> submission_owner and not public.is_current_dibooks_admin() then
    raise exception 'Geen toegang tot deze reviewinzending.';
  end if;

  if submission_status <> 'pending' then
    raise exception 'Alleen een inzending in afwachting kan worden gescand.';
  end if;

  -- Alleen eerdere automatische flags vervangen.
  -- Handmatige/adminflags blijven altijd onaangetast.
  delete from public.moderation_flags
  where submission_id = input_submission_id
    and source = 'openai';

  if jsonb_typeof(coalesce(input_flags, '[]'::jsonb)) <> 'array' then
    raise exception 'input_flags moet een JSON-array zijn.';
  end if;

  for item in
    select value
    from jsonb_array_elements(coalesce(input_flags, '[]'::jsonb))
  loop
    if nullif(btrim(coalesce(item->>'node_id', '')), '') is null then
      continue;
    end if;

    normalized_severity := lower(coalesce(item->>'severity', 'medium'));
    if normalized_severity not in ('low', 'medium', 'high') then
      normalized_severity := 'medium';
    end if;

    insert into public.moderation_flags (
      submission_id,
      node_id,
      category,
      severity,
      reason,
      source
    )
    values (
      input_submission_id,
      item->>'node_id',
      left(coalesce(nullif(btrim(item->>'category'), ''), 'Automatische controle'), 160),
      normalized_severity,
      left(coalesce(nullif(btrim(item->>'reason'), ''), 'Automatische scan vraagt om menselijke controle.'), 1200),
      'openai'
    );

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.replace_auto_moderation_flags(uuid, jsonb) from public;
grant execute on function public.replace_auto_moderation_flags(uuid, jsonb) to authenticated;
