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

Jesli w repo nadal jest jakikolwiek stary plik w `.github/workflows/`, usun go na razie. Stary workflow od GitHub Pages robil z aplikacji strone statyczna, a CodeQL potrafi dodatkowo probowac analizowac same workflowy jako `actions`. Ta aplikacja potrzebuje Render `Web Service`, bo ma backend Node i endpointy `/api/...`.

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

## Jesli Render/GitHub nie pokazuje aktualizacji

1. W Render wejdz w usluge `bal-lekarza-28`.
2. Sprawdz `Events` albo `Logs`, czy po pushu ruszyl nowy deploy.
3. Jesli nie ruszyl, kliknij `Manual Deploy`.
4. Jesli dalej pokazuje stara wersje, kliknij `Manual Deploy -> Clear build cache & deploy`.
5. Upewnij sie, ze w repo pliki sa w katalogu glownym: `server.js`, `package.json`, `public/`, `render.yaml`.
6. W przegladarce zrob twarde odswiezenie. Na telefonie/PWA czasem trzeba zamknac aplikacje i otworzyc ponownie.

Ta paczka ma podbite cache aplikacji do `v30`, zeby wymusic pobranie nowego `app.js`, `app.css` i `sw.js`.

## Jesli wyskakuje blad CodeQL `actions`

To nie jest blad aplikacji. GitHub probuje skanowac workflowy GitHub Actions, a my ich nie potrzebujemy do Rendera.

Najprosciej:

1. Usun z repo folder `.github/workflows/`, jesli jest tam stary workflow.
2. W GitHub wejdź w `Settings -> Code security and analysis -> CodeQL`.
3. Jesli CodeQL jest wlaczony automatycznie i dalej skanuje `GitHub Actions`, wylacz go albo ustaw skanowanie tylko dla JavaScript/TypeScript.
4. Render powinien deployowac po pushu z repo przez `render.yaml`, bez GitHub Pages i bez workflowu statycznego.
