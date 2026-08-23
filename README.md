# DiBooks Function / Flags Node v1

Vervang/plaats:

- app/editor/page.tsx
- app/books/[bookId]/read/page.tsx
- app/dashboard/page.tsx

Geen SQL nodig.

Nieuw:

- Functie / flags node in de Auteur Studio toolbar
- Functie-node is onzichtbaar in de reader
- Functie-node voert acties uit en gaat automatisch door via zijn ene path
- Acties:
  - Flag aanzetten
  - Flag uitzetten
  - Getal verhogen
  - Getal verlagen
  - Getal instellen
- Flags worden per boek lokaal opgeslagen in de reader
- Opnieuw lezen wist ook de flags van dat boek
- Functie-nodes tellen niet mee als verhaalnode voor publicatie-stats
- Dashboard publicatiecheck waarschuwt als een functie-node geen ingevulde actie heeft
- Dashboard blokkeert publiceren als een functie-node geen vervolgpath heeft

Test:

1. Maak Tekst-node A.
2. Maak Functie-node.
3. Zet actie: Flag aanzetten -> told_michael.
4. Verbind Tekst A -> Functie -> Tekst B.
5. Test in reader: functie-node moet niet als pagina zichtbaar blijven, maar direct doorsturen.

Volgende fase wordt: conditionele paths / IF IF NOT.
