-- ================================================================
-- DiBooks - Public Studio Trial V1
-- AUTHOR WRITE ENTITLEMENT GUARD
-- ================================================================
-- RUN DIT NA Guest Library & Plans V1.
--
-- Studio proefmodus:
-- - iedereen mag lokaal bouwen;
-- - database/dashboard writes alleen Author Pro of admin.
--
-- Dit verwijdert of verbergt GEEN bestaande boeken.
-- Een ex-auteur behoudt dus ownership + live publicaties, maar kan zonder
-- Author Pro geen boek/project/serie wijzigen of een nieuwe review indienen.
-- ================================================================

begin;

create or replace function public.dibooks_has_active_author_write_access()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_plan text;
  v_auth_role text;
begin
  v_auth_role := auth.role();

  -- Trusted SQL / service-role backend blijft toegestaan.
  if v_auth_role is null or v_auth_role = 'service_role' then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  select p.role::text, p.plan::text
  into v_role, v_plan
  from public.profiles p
  where p.id = auth.uid();

  if v_role = 'admin' then
    return true;
  end if;

  return v_role = 'author' and v_plan = 'author_pro';
end;
$$;

revoke all on function public.dibooks_has_active_author_write_access() from public;
grant execute on function public.dibooks_has_active_author_write_access() to authenticated;

create or replace function public.dibooks_require_active_author_write_access()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.dibooks_has_active_author_write_access() then
    raise exception
      'Author Pro is required to create or modify DiBooks author content.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.dibooks_require_active_author_write_access() from public;
revoke all on function public.dibooks_require_active_author_write_access() from anon;
revoke all on function public.dibooks_require_active_author_write_access() from authenticated;

-- books
drop trigger if exists trg_dibooks_require_author_write_books on public.books;
create trigger trg_dibooks_require_author_write_books
before insert or update or delete on public.books
for each row
execute function public.dibooks_require_active_author_write_access();

-- book_projects
drop trigger if exists trg_dibooks_require_author_write_book_projects on public.book_projects;
create trigger trg_dibooks_require_author_write_book_projects
before insert or update or delete on public.book_projects
for each row
execute function public.dibooks_require_active_author_write_access();

-- book_series (alleen als Series al aanwezig is)
do $$
begin
  if to_regclass('public.book_series') is not null then
    execute 'drop trigger if exists trg_dibooks_require_author_write_book_series on public.book_series';
    execute '
      create trigger trg_dibooks_require_author_write_book_series
      before insert or update or delete on public.book_series
      for each row
      execute function public.dibooks_require_active_author_write_access()
    ';
  end if;
end;
$$;

-- moderation submission: lapsed/free readers mogen niet via een directe
-- client/RPC-call alsnog een nieuwe publicatie/revisie indienen.
do $$
begin
  if to_regclass('public.moderation_submissions') is not null then
    execute 'drop trigger if exists trg_dibooks_require_author_submit on public.moderation_submissions';
    execute '
      create trigger trg_dibooks_require_author_submit
      before insert on public.moderation_submissions
      for each row
      execute function public.dibooks_require_active_author_write_access()
    ';
  end if;
end;
$$;

commit;

-- Controle:
select id, email, plan, role
from public.profiles
order by email nulls last;
