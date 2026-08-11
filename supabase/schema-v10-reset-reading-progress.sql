-- Allow users to reset/delete their own reading progress.

alter table public.reading_progress enable row level security;

drop policy if exists "Users can delete own reading progress" on public.reading_progress;
drop policy if exists "Users can reset own reading progress" on public.reading_progress;

create policy "Users can reset own reading progress"
on public.reading_progress
for delete
to authenticated
using (user_id = auth.uid());

notify pgrst, 'reload schema';

select 'reading progress reset policy ready' as status;
