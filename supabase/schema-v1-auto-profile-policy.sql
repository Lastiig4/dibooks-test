-- DiBooks Schema v1.2 helper
-- Nodig voor Auto Profile Check v1.
-- Hiermee mag een ingelogde gebruiker zijn eigen profile rij aanmaken
-- als die door oudere accounts of triggerproblemen nog ontbreekt.

drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());
