-- DiBooks Reader Readback History V1
-- RUN DIT EERST in Supabase SQL Editor.

alter table public.reading_progress
  add column if not exists run_history jsonb not null default '[]'::jsonb;

update public.reading_progress
set run_history = '[]'::jsonb
where run_history is null;

comment on column public.reading_progress.run_history is
  'Ordered immutable-ish history of the reader''s current story run. Used for readonly back-reading without re-running choices, flags, conditions or minigames.';
