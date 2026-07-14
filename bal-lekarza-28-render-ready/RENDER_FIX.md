# Naprawiona paczka Render/GitHub

Ta wersja ma pelny `index.html` i pelny `server.js`. Poprzedni ZIP z GitHuba mial obciety HTML, dlatego `app.js` wyrzucal bledy typu:

- `#profile-form` nie istnieje,
- `#seat-summary` nie istnieje,
- `#room-tabs` nie istnieje,
- `#admin-welcome` nie istnieje.

## Jak wrzucic

Najprosciej: zawartosc tego folderu wrzuc bezposrednio do glownego katalogu repozytorium GitHub.

W repo powinno byc od razu:

- `server.js`
- `package.json`
- `public/`
- `supabase/`
- `render.yaml`
- `README.md`

Nie dawaj dodatkowego folderu `bal-app-github-ready/` jako kontenera calej aplikacji.

Jesli w repo nadal jest stary plik `.github/workflows/static.yml` od GitHub Pages, podmien go tym z tej paczki albo usun. Stary workflow robil z aplikacji strone statyczna, a ta aplikacja potrzebuje Render `Web Service`, bo ma backend Node i endpointy `/api/...`.

## Render

W Render wybierz usluge typu `Web Service`, nie `Static Site`.

Ustaw:

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Zmienne srodowiskowe:

```env
NODE_ENV=production
INITIAL_ADMIN_EMAIL=admin@bal.local
INITIAL_ADMIN_PASSWORD=ustaw-wlasne-dlugie-haslo
SEED_DEMO_USER=false
SUPABASE_URL=https://tojnfucurkubpyvsvtia.supabase.co/rest/v1
SUPABASE_STATE_TABLE=app_state
SUPABASE_STATE_ID=main
SUPABASE_SERVICE_ROLE_KEY=nowy-klucz-tylko-w-renderze
LOCAL_DATA_WRITES=false
```

## Supabase

Przed pierwszym startem produkcji uruchom w Supabase SQL Editor plik:

`supabase/schema.sql`

Klucz `SUPABASE_SERVICE_ROLE_KEY` trzymaj tylko w Renderze, nigdy w GitHubie.

## Test po deployu

Po wdrozeniu sprawdz:

- `/health` powinno zwrocic `{"ok":true}`,
- `/bal-lekarza-28` powinno pokazac strone,
- logowanie admina powinno dzialac haslem z `INITIAL_ADMIN_PASSWORD`.

Nie przekazuj hasla w adresie URL, np. przez `?password=...`. Haslo powinno byc wpisywane w formularzu logowania.
