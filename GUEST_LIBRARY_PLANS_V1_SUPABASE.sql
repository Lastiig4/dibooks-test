-- ================================================================
-- DiBooks - Guest Library & Plans V1
-- PLAN/ROLE ENTITLEMENT GUARD
-- ================================================================
-- Doel:
--   plan = free | reader_plus | author_pro
--   role = reader | author | admin
--
-- Regels:
--   free        -> reader
--   reader_plus -> reader
--   author_pro  -> author
--   admin blijft admin, onafhankelijk van plan.
--
-- BELANGRIJK:
-- Betaalde rechten worden niet vanuit de browser toegekend.
-- Een toekomstige payment webhook/service_role hoeft alleen `plan`
-- te wijzigen; deze trigger synchroniseert dan automatisch `role`.
-- ================================================================

begin;

-- 1) Bestaande gewone accounts één keer normaliseren.
--    Boeken/eigenaarschap worden NIET aangepast of verwijderd.
update public.profiles
set role = case
  when plan::text = 'author_pro' then 'author'::public.dibooks_user_role
  else 'reader'::public.dibooks_user_role
end
where role::text <> 'admin';

-- 2) Nieuwe profielen starten altijd veilig als Gratis / Reader.
--    Bij updates mag een gewone ingelogde gebruiker zichzelf geen
--    betaald plan of hogere rol geven. Trusted SQL/service_role mag
--    het plan wel wijzigen; role volgt dan automatisch.
create or replace function public.dibooks_guard_and_sync_profile_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    new.plan := 'free'::public.dibooks_user_plan;
    new.role := 'reader'::public.dibooks_user_role;
    return new;
  end if;

  -- Een bestaande admin wordt nooit door een planwijziging gedegradeerd.
  if old.role::text = 'admin' then
    new.role := 'admin'::public.dibooks_user_role;
    return new;
  end if;

  -- Een normale gebruiker mag via de browser zijn eigen entitlement
  -- niet verhogen of aanpassen. Andere profielvelden blijven vrij van
  -- deze trigger omdat de trigger alleen op plan/role updates draait.
  if auth.role() = 'authenticated' and auth.uid() = new.id then
    new.plan := old.plan;
    new.role := old.role;
    return new;
  end if;

  -- Trusted SQL/service_role mag expliciet een nieuwe admin aanwijzen.
  -- Dit is nooit bereikbaar via de openbare registratieflow.
  if auth.uid() is null and new.role::text = 'admin' then
    return new;
  end if;

  -- Voor alle normale accounts volgt role voortaan het betaalplan.
  if new.plan::text = 'author_pro' then
    new.role := 'author'::public.dibooks_user_role;
  else
    new.role := 'reader'::public.dibooks_user_role;
  end if;

  return new;
end;
$$;

revoke all on function public.dibooks_guard_and_sync_profile_entitlements() from public;
revoke all on function public.dibooks_guard_and_sync_profile_entitlements() from anon;
revoke all on function public.dibooks_guard_and_sync_profile_entitlements() from authenticated;

drop trigger if exists trg_dibooks_profile_entitlements_insert on public.profiles;
create trigger trg_dibooks_profile_entitlements_insert
before insert on public.profiles
for each row
execute function public.dibooks_guard_and_sync_profile_entitlements();

drop trigger if exists trg_dibooks_profile_entitlements_update on public.profiles;
create trigger trg_dibooks_profile_entitlements_update
before update of plan, role on public.profiles
for each row
execute function public.dibooks_guard_and_sync_profile_entitlements();

commit;

-- ================================================================
-- TEST / CONTROLE
-- ================================================================
-- Deze query hoort per account één geldige combinatie te tonen:
--   free        / reader
--   reader_plus / reader
--   author_pro  / author
--   elk plan     / admin
select id, email, plan, role
from public.profiles
order by email nulls last;

-- Handmatig een betaling simuleren tijdens ontwikkeling:
-- update public.profiles set plan = 'reader_plus' where id = '<uuid>';
-- -> role wordt automatisch reader
--
-- update public.profiles set plan = 'author_pro' where id = '<uuid>';
-- -> role wordt automatisch author
--
-- update public.profiles set plan = 'free' where id = '<uuid>';
-- -> role wordt automatisch reader
--
-- Gepubliceerde boeken blijven aan owner_id gekoppeld; deze SQL verwijdert
-- of wijzigt geen boeken, publicaties, voortgang of eigenaarschap.
