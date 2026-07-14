# Bal Lekarza 2028 - wersja statyczna

Ta paczka jest zwykla strona:

- `index.html`
- `style.css`
- `app.js`
- `config.js`
- `assets/`
- `supabase/schema.sql`

Nie ma tutaj Rendera, Node, `server.js` ani endpointow `/api/...`.

## Jak to dziala

Hosting:

`GitHub Pages / Netlify / Vercel Static`

Dane i logowanie:

`Supabase Auth + tabele Supabase`

## Co wrzucic na GitHuba

Wrzucasz zawartosc tego folderu do glownego katalogu repo.

W repo powinno byc od razu:

- `index.html`
- `style.css`
- `app.js`
- `config.js`
- `assets/`
- `supabase/`
- `.nojekyll`

Nie wrzucaj tego jako jednego pliku `.zip`.

## Supabase

1. Wejdz do Supabase.
2. Otworz `SQL Editor`.
3. Wklej i uruchom caly plik:

`supabase/schema.sql`

4. W `Authentication -> Users` utworz konto admina.
5. Na dole `schema.sql` jest komenda, ktora nadaje temu kontu role admina. Podmien email i uruchom.

## Dane ze starej aplikacji

Jesli w Supabase istnieje stara tabela `app_state`, skrypt `schema.sql` sprobuje przeniesc uczestnikow do nowej tabeli `participants`.

Stare dane nie sa kasowane.

## Bezpieczenstwo

W `config.js` jest tylko klucz publiczny Supabase. To normalne dla statycznej strony.

Nie wolno dawac do GitHuba:

- tajnego klucza Supabase,
- klucza serwisowego bazy,
- `.env`,
- prywatnych backupow z danymi.

## Co umie ta wersja

- logowanie przez Supabase,
- rejestracja absolwenta,
- blokada drugiego zapisu na ten sam numer albumu,
- uczestnik widzi swoje platnosci, diete, transport i miejsce,
- uczestnik moze edytowac tylko swoje bezpieczne dane,
- admin widzi statystyki,
- admin edytuje tresci strony i kolory,
- admin edytuje platnosci, statusy, stoliki, diety i transport,
- admin pobiera backup JSON i liste CSV,
- admin moze uruchomic proste auto-usadzenie.

## Wazne

Ta wersja nie uzywa Rendera. Jesli dalej chcesz miec eksporty Excel `.xlsx`, upload zdjec albo bardziej zaawansowane operacje serwerowe, wtedy potrzebny bylby backend. Do stabilnej strony zapisowej na GitHubie ta wersja jest prostsza.
