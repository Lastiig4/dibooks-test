# DiBooks Database Plan v1

Dit document beschrijft de eerste database-structuur voor DiBooks. Het doel is om later zonder chaos over te stappen van `localStorage` naar echte accounts, dashboard-opslag en publicatie via een database.

## Platformregels

### Gast
Een gast mag:

- De publieke Library bekijken.
- Boekdetailpagina’s bekijken.
- Boeken lezen, zodra lezen publiek beschikbaar is.
- De Auteur Studio gebruiken.
- Werk lokaal opslaan als `.dibooks-project.json`.
- Reader-versie exporteren als `story.json`.

Een gast mag niet:

- Boeken opslaan in het Dashboard.
- Boeken publiceren naar de Library.
- Andere auteurs toevoegen.
- Feedback delen binnen het platform.

### Auteur
Een auteur mag:

- Inloggen en registreren.
- Het Dashboard gebruiken.
- Eigen boeken maken.
- Eigen conceptboeken bewerken.
- Eigen boeken opslaan in het Dashboard.
- Testversies delen met geselecteerde auteurs/testlezers.
- Feedback ontvangen.
- Conceptboeken publiceren naar de Library.
- Live boeken uit de Library verwijderen.

Een auteur mag niet:

- Boeken van andere auteurs aanpassen, tenzij hij/zij als collaborator is toegevoegd.
- Een live boek direct aanpassen zolang het in de Library staat.

### Admin
Een admin mag:

- Alle boeken bekijken.
- Misbruik of illegale content verwijderen.
- Auteurs beheren.
- Gebruikers blokkeren.
- Handmatig boeken offline halen.

## Belangrijkste publicatieregel

Een boek dat live in de Library staat, is vergrendeld.

Dat betekent:

- Live boek = niet direct bewerkbaar.
- Wil een auteur een live boek wijzigen, dan moet het boek eerst uit de Library worden gehaald.
- Na verwijderen uit de Library wordt het weer een concept.
- Pas daarna kan de auteur het boek bewerken en later opnieuw publiceren.

Reden: lezers mogen niet midden in een verhaal zitten terwijl de auteur nodes, paden of keuzes verandert.

## Aanbevolen techniek

Voor later wordt Supabase aanbevolen, omdat het in één pakket biedt:

- Auth / login / register.
- PostgreSQL database.
- Storage voor covers, banners en story-bestanden.
- Row Level Security voor rechten per gebruiker.
- Realtime of latere collaboration-opties.

## Tabellen

## 1. profiles

Wordt gekoppeld aan Supabase Auth users.

Doel: publieke en interne profielinformatie van een gebruiker opslaan.

Velden:

```sql
profiles (
  id uuid primary key references auth.users(id),
  display_name text not null,
  username text unique,
  email text,
  role text not null default 'author', -- guest bestaat niet als db-user
  avatar_url text,
  bio text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)
```

Rollen:

```text
author
admin
```

Gastgebruikers bestaan niet in de database. Een gast is gewoon iemand zonder sessie.

## 2. books

Doel: de hoofdgegevens van een boek opslaan.

Velden:

```sql
books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  title text not null,
  slug text not null unique,
  subtitle text,
  description text,
  author_name text,
  main_genre text,
  genres text[] default '{}',
  age_rating text, -- AL, 6+, 9+, 12+, 16+, 18+
  status text not null default 'concept', -- concept, test, live, offline
  is_locked boolean not null default false,
  cover_url text,
  banner_url text,
  estimated_reading_time text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  published_at timestamptz,
  unpublished_at timestamptz
)
```

Statussen:

```text
concept = bewerkbaar door eigenaar/collaborators
test = deelbaar met testers, nog niet publiek
live = zichtbaar in publieke Library en vergrendeld
offline = uit Library gehaald
```

Regel:

```text
status = live  => is_locked = true
status != live => is_locked = false, behalve als later handmatig gelockt door admin
```

## 3. book_projects

Doel: het bewerkbare editor-project bewaren.

Dit is vergelijkbaar met het huidige `.dibooks-project.json`.

Velden:

```sql
book_projects (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  project_data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)
```

`project_data` bevat:

```json
{
  "version": 1,
  "type": "dibooks-project",
  "bookTitle": "The Sovereign",
  "startNodeId": "node_1",
  "nodes": [],
  "edges": []
}
```

Regel:

- Alleen bewerkbaar als het boek niet live is.
- Live/vergrendelde boeken mogen niet direct worden overschreven.

## 4. book_publications

Doel: de reader-versie opslaan die live of testbaar is.

Dit is de veilige snapshot die lezers openen.

Velden:

```sql
book_publications (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  version_label text not null default 'v1.0',
  story_data jsonb not null,
  publication_type text not null, -- test, live
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  is_active boolean not null default true
)
```

Waarom aparte publication?

- De editor-data en de reader-data blijven gescheiden.
- Een live boek gebruikt een vaste snapshot.
- Lezers krijgen niet ineens andere nodes terwijl ze lezen.

Bij simpelste DiBooks-regel gebruiken we voorlopig:

```text
1 actieve live-publication per boek
```

Als het boek uit de Library wordt gehaald:

```text
books.status = offline
books.is_locked = false
book_publications.is_active = false voor live-publicatie
```

## 5. book_collaborators

Doel: auteurs/testlezers toevoegen aan een boek.

Velden:

```sql
book_collaborators (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null, -- co_author, editor, tester, viewer
  invited_by uuid references profiles(id),
  accepted boolean not null default false,
  created_at timestamptz default now()
)
```

Rollen:

```text
co_author = mag meeschrijven zolang boek concept/test is
editor = mag tekst aanpassen maar niet publiceren
tester = mag testversie lezen en feedback geven
viewer = mag alleen testversie lezen
```

Regels:

- Owner heeft altijd volledige rechten.
- Collaborators mogen nooit een live boek wijzigen.
- Alleen owner of admin mag publiceren.

## 6. book_feedback

Doel: feedback geven op testboeken.

Velden:

```sql
book_feedback (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  publication_id uuid references book_publications(id) on delete set null,
  user_id uuid not null references profiles(id),
  node_id text,
  page_index integer,
  feedback_type text default 'note', -- note, typo, bug, story, choice
  message text not null,
  status text not null default 'open', -- open, resolved, ignored
  created_at timestamptz default now(),
  resolved_at timestamptz
)
```

Voorbeelden:

```text
Typfout in hoofdstuk 3
Deze keuze voelt onduidelijk
Minigame route werkt niet
Deze scène is sterk
```

## 7. reading_progress

Doel: later voortgang per account opslaan.

Velden:

```sql
reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  publication_id uuid references book_publications(id) on delete set null,
  current_node_id text,
  page_index integer default 0,
  progress_percent numeric default 0,
  updated_at timestamptz default now(),
  unique(user_id, book_id)
)
```

Deze bouwen we pas later, omdat de gebruiker eerst accounts wil voordat “Verder lezen” belangrijk wordt.

## 8. book_ratings

Doel: later reviews/ratings.

Velden:

```sql
book_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  rating integer check (rating >= 1 and rating <= 5),
  review text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, book_id)
)
```

## Rechtenmatrix v1

| Actie | Gast | Auteur eigenaar | Collaborator | Admin |
|---|---:|---:|---:|---:|
| Library bekijken | Ja | Ja | Ja | Ja |
| Reader gebruiken | Ja* | Ja | Ja | Ja |
| Auteur Studio openen | Ja | Ja | Ja | Ja |
| Lokaal opslaan | Ja | Ja | Ja | Ja |
| Dashboard openen | Nee | Ja | Ja | Ja |
| Boek opslaan in dashboard | Nee | Ja | Alleen met rechten | Ja |
| Concept bewerken | Nee | Ja | Ja, met rechten | Ja |
| Testversie delen | Nee | Ja | Nee | Ja |
| Feedback geven | Nee | Ja, als tester/collab | Ja | Ja |
| Publiceren naar Library | Nee | Ja | Nee | Ja |
| Live boek wijzigen | Nee | Nee | Nee | Alleen nood/adminactie |
| Live boek offline halen | Nee | Ja | Nee | Ja |

`Ja*`: later kan lezen account-verplicht worden. Voor nu staat dit nog open zolang de app in testfase is.

## Publicatie-flow

### Concept opslaan

```text
Editor → Save menu → Opslaan in Dashboard
```

Effect:

```text
books.status = concept
books.is_locked = false
book_projects.project_data = huidige editor project
```

### Testversie maken

```text
Dashboard → Maak testversie
```

Effect:

```text
books.status = test
book_publications.publication_type = test
book_publications.story_data = reader export snapshot
```

### Publiceren naar Library

```text
Dashboard → Publiceer naar Library
```

Waarschuwing:

```text
Na publicatie wordt dit boek vergrendeld. Je kunt het niet aanpassen zolang het live in de Library staat.
```

Effect:

```text
books.status = live
books.is_locked = true
books.published_at = now()
book_publications.publication_type = live
book_publications.story_data = vaste reader snapshot
```

### Verwijderen uit Library

```text
Dashboard → Verwijder uit Library
```

Waarschuwing:

```text
Lezers kunnen dit boek niet meer starten vanuit de Library. Daarna kun je het boek weer bewerken als concept.
```

Effect:

```text
books.status = concept of offline
books.is_locked = false
books.unpublished_at = now()
book_publications.is_active = false voor live-publicatie
```

Voor DiBooks v1 kiezen we:

```text
Na verwijderen uit Library wordt het boek weer concept.
```

## Storage-structuur later

Voor Supabase Storage:

```text
book-assets/
  {bookId}/
    cover.jpg
    banner.jpg
    trailer.mp4

book-exports/
  {bookId}/
    story-v1.json
    story-test.json
```

In de database bewaren we alleen de URL/pad.

## Migratie van huidige localStorage naar database

Huidige lokale dashboardboeken bevatten ongeveer:

```json
{
  "id": "dashboard_book_...",
  "title": "...",
  "author": "...",
  "genres": [],
  "status": "concept",
  "projectData": {},
  "ownerId": "demo-user"
}
```

Migratie later:

1. Maak `profiles` record voor gebruiker.
2. Maak `books` record voor elk dashboardboek.
3. Zet metadata in `books`.
4. Zet editorproject in `book_projects.project_data`.
5. Als status live is, maak `book_publications` snapshot.
6. Verwijder lokale data pas na succesvolle sync.

## Volgende technische stappen

Aanbevolen volgorde:

1. Supabase project aanmaken.
2. Auth inschakelen.
3. `profiles` tabel maken.
4. Echte Login/Register knoppen koppelen.
5. Demo-login vervangen door Supabase sessie.
6. `books` en `book_projects` tabellen maken.
7. Dashboardboeken opslaan in database.
8. Editor Save menu koppelen aan database.
9. Publiceren naar Library via `book_publications`.
10. Testers/collaborators toevoegen.
11. Feedbacksysteem toevoegen.
12. Reading progress toevoegen.

## Open keuzes voor later

Nog te bepalen:

- Moet lezen altijd account-verplicht zijn, of mogen sommige boeken gratis publiek gelezen worden?
- Mag een auteur een live boek volledig dupliceren als nieuwe editie?
- Krijgt ieder boek een versie-label zoals `v1.0`, of houden we dat intern?
- Wordt feedback per pagina, node, keuze of alinea gekoppeld?
- Kunnen auteurs meerdere pseudoniemen gebruiken?
- Hoe gaan betaalde boeken werken?
- Moet een boek na verwijderen uit Library direct weer concept worden, of eerst offline maar locked blijven?

