# Gotowe do wrzucenia na GitHub

## Co wrzucic

Wrzucasz zawartosc folderu aplikacji albo gotowa paczke `bal-app-github-ready.zip`.

Bezpiecznie w repo zostaja:

- `server.js`
- `package.json`
- `public/`
- `scripts/`
- `supabase/`
- `.env.example`
- `.gitignore`
- `README.md`

Nie wrzucaj prawdziwych danych:

- `data/app-data.json`
- `backups/*.xlsx`
- `backups/*.json`
- `.env`
- prywatnych uploadow i zdjec uczestnikow

## Pierwsze uruchomienie na hostingu

W panelu hostingu ustaw zmienne:

```env
NODE_ENV=production
INITIAL_ADMIN_EMAIL=twoj-admin@email.pl
INITIAL_ADMIN_PASSWORD=dlugie-nowe-haslo
SEED_DEMO_USER=false
SUPABASE_URL=https://tojnfucurkubpyvsvtia.supabase.co/rest/v1
SUPABASE_STATE_TABLE=app_state
SUPABASE_STATE_ID=main
SUPABASE_SERVICE_ROLE_KEY=nowy-klucz-tylko-na-serwerze
LOCAL_DATA_WRITES=false
```

Przed produkcja obroc klucz tajny Supabase, jesli byl kiedykolwiek wklejany poza panelem hostingu.

## Komendy lokalne

```bash
npm start
```

albo:

```bash
node server.js
```
