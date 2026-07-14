# Bal Lekarza - aplikacja PWA

To jest działający prototyp aplikacji na bal: jedna aplikacja działa w przeglądarce, na iOS i Androidzie jako PWA po dodaniu do ekranu głównego.

Jeśli wdrażasz na Renderze, zacznij od pliku `RENDER_FIX.md`.

Ta aplikacja wymaga serwera Node.js. Nie wdrażaj jej jako samej statycznej strony GitHub Pages, bo wtedy nie zadziałają logowanie, zapisy, panel admina i endpointy `/api/...`.

## Co jest gotowe

- konto uczestnika i konto administratora,
- rejestracja na bal z automatycznym dopisaniem do ukrytej listy admina,
- plan stołów na podstawie załączonego układu,
- wyszukiwarka osób i miejsc,
- status opłacenia balu, transportu, diety i miejsca,
- infopak edytowany z panelu admina,
- mapa/dojazd oraz informacja o transporcie,
- ukryty panel administratora,
- edycja tekstów, kolorów i danych uczestników,
- wysyłka seryjna jako komunikaty w aplikacji,
- eksport kopii zapasowej do pliku Excel `.xlsx`,
- import aktualizacji z CSV.

## Dane demo lokalne

Przy lokalnym uruchomieniu bez `NODE_ENV=production` aplikacja tworzy konta demo:

`student@bal.local` / `student123!`

`admin@bal.local` / `admin123!`

Po wdrożeniu produkcyjnym nie używaj haseł demo. Ustaw własne:

```env
NODE_ENV=production
INITIAL_ADMIN_EMAIL=twoj-admin@email.pl
INITIAL_ADMIN_PASSWORD=dlugie-nowe-haslo
SEED_DEMO_USER=false
```

## Uruchomienie lokalne

W folderze aplikacji:

```bash
node server.js
```

Jeśli zwykłe `node` nie jest dostępne, użyj Node.js z runtime Codex:

```bash
/Users/maksymilianjaneczek/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
```

Aplikacja ruszy pod adresem:

`http://localhost:4173`

## Instalacja na telefonie

Android:

1. Otwórz stronę w Chrome.
2. Wejdź w menu przeglądarki.
3. Wybierz `Dodaj do ekranu głównego` albo `Zainstaluj aplikację`.

iOS:

1. Otwórz stronę w Safari.
2. Kliknij udostępnianie.
3. Wybierz `Do ekranu początkowego`.

## Jak dodać aplikację na serwer online

Najprościej użyć hostingu Node.js. Jeśli chcesz iść w kierunku darmowego zestawu, sensowny wariant to frontend/hosting na Vercel oraz dane w Supabase. Ta aplikacja ma też tryb pomostowy Supabase opisany w `supabase/README.md`.

Minimalne wymagania:

- Node.js 20 lub nowszy,
- HTTPS,
- możliwość ustawienia zmiennych środowiskowych,
- przy trybie lokalnym: możliwość zapisu plików w folderze `data/` i `backups/`,
- domena lub subdomena.

Kroki:

1. Wgraj cały folder `bal-app` na serwer.
2. Ustaw zmienną środowiskową `PORT`, jeśli hosting jej wymaga.
3. Uruchom `node server.js`.
4. Podepnij domenę i certyfikat SSL.
5. Zaloguj się jako admin i zmień hasła testowe.
6. Zrób eksport Excel jako pierwszą kopię kontrolną.

## Supabase jako baza

W folderze `supabase/` jest gotowy plik `schema.sql`. Po jego uruchomieniu w Supabase ustaw na hostingu zmienne:

```env
NODE_ENV=production
INITIAL_ADMIN_EMAIL=twoj-admin@email.pl
INITIAL_ADMIN_PASSWORD=dlugie-nowe-haslo
SEED_DEMO_USER=false
SUPABASE_URL=https://tojnfucurkubpyvsvtia.supabase.co/rest/v1
SUPABASE_STATE_TABLE=app_state
SUPABASE_STATE_ID=main
SUPABASE_SERVICE_ROLE_KEY=WKLEJ_TUTAJ_NOWY_KLUCZ_TYLKO_W_PANELU_HOSTINGU
LOCAL_DATA_WRITES=false
```

Klucza tajnego nie zapisuj w kodzie ani w plikach publicznych. Klucz publiczny Supabase moze byc pozniej uzyty w frontendzie, ale obecny wariant go nie potrzebuje, bo zapis idzie przez backend aplikacji.

## Jak wydać aplikację

Wariant zalecany na bal:

1. Wdrożenie jako PWA pod linkiem, np. `https://bal.twojadomena.pl`.
2. Wysłanie linku studentom.
3. Uczestnicy logują się lub rejestrują.
4. Chętni dodają aplikację do ekranu głównego.

Wariant sklepowy iOS/Android jest możliwy później, ale wymaga kont deweloperskich Apple/Google, testów, procesu publikacji i osobnej konfiguracji. Na wydarzenie jednorazowe PWA jest szybsze i tańsze.

## Excel i kopie zapasowe

Panel admina ma:

- `Eksport Excel` - pobiera aktualny stan,
- `Kopia zapasowa` - zapisuje plik `.xlsx` w folderze `backups/`,
- import CSV - aktualizuje osoby po `id`, `email` albo `name`.

Wersja produkcyjna powinna traktować Excel jako backup/import, a nie jedyną bazę danych. Przy wielu administratorach bezpieczniejsza będzie baza PostgreSQL albo SQLite z regularnymi kopiami.

## Co trzeba dopracować przed prawdziwym wdrożeniem

- realna polityka haseł i reset hasła,
- regulamin i informacja RODO,
- produkcyjny storage zdjęć, np. S3 albo Cloudinary,
- prawdziwe web push z VAPID i HTTPS, jeśli komunikaty mają dochodzić przy zamkniętej aplikacji,
- automatyczne backupy na zewnętrzne miejsce,
- testy na telefonach organizatorów.
