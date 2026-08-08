npm run build
npm run dev-- DiBooks Supabase Schema v1.1 helper
-- Alleen nodig als je account al bestond vóór schema-v1.sql was uitgevoerd.
-- Hiermee mag een ingelogde gebruiker zijn eigen profile rij aanmaken.

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());
