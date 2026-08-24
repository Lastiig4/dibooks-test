-- DiBooks Account & Security V1
-- Voer dit EEN KEER uit in Supabase SQL Editor.
--
-- Deze migratie voegt alleen een aparte auteursnaam toe.
-- Bestaande boeken/publicaties worden NIET gewijzigd.

begin;

alter table public.profiles
  add column if not exists author_name text;

update public.profiles
set author_name = coalesce(nullif(trim(author_name), ''), nullif(trim(display_name), ''), split_part(email, '@', 1))
where author_name is null or trim(author_name) = '';

comment on column public.profiles.author_name is
  'Public author/pen name used as the default author name for NEW DiBooks. Existing books keep their stored author metadata.';

commit;

select id, display_name, author_name, email, plan, role
from public.profiles
order by email nulls last;
