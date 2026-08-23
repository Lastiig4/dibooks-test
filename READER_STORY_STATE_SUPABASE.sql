-- DiBooks - Reader Story State
-- Eenmalig uitvoeren in Supabase SQL Editor.
--
-- Slaat de actuele interactieve verhaalstatus per lezer/per boek op:
-- booleans, tellers en tekstvariabelen.
--
-- Bestaande leesvoortgang blijft behouden.

alter table public.reading_progress
  add column if not exists story_state jsonb not null default '{}'::jsonb;

update public.reading_progress
set story_state = '{}'::jsonb
where story_state is null;

comment on column public.reading_progress.story_state is
  'DiBooks runtime story variables for this reader and book.';
