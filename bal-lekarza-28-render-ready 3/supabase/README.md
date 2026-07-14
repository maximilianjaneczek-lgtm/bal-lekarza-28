# Supabase dla Bal Lekarza 2028

To jest bezpieczny wariant pomostowy: aplikacja nadal dziala lokalnie z pliku, a po ustawieniu zmiennych srodowiskowych zapisuje caly stan do Supabase.

## 1. Utworz tabele

1. Wejdz do projektu Supabase.
2. Otworz `SQL Editor`.
3. Wklej zawartosc pliku `supabase/schema.sql`.
4. Uruchom zapytanie.

## 2. Ustaw zmienne na serwerze

W panelu Vercel, Render, Railway albo innego hostingu dodaj:

```env
SUPABASE_URL=https://tojnfucurkubpyvsvtia.supabase.co/rest/v1
SUPABASE_STATE_TABLE=app_state
SUPABASE_STATE_ID=main
SUPABASE_SERVICE_ROLE_KEY=WKLEJ_TUTAJ_NOWY_KLUCZ_Z_SUPABASE
LOCAL_DATA_WRITES=false
```

Klucza `SUPABASE_SERVICE_ROLE_KEY` nie zapisuj w plikach frontendowych i nie wysylaj go uczestnikom. To jest haslo serwera do bazy.

## 3. Co to daje

- lokalnie aplikacja dalej moze dzialac z `data/app-data.json`,
- na serwerze stan moze byc trzymany w Supabase,
- backup Excela nadal zostaje jako szybka kopia kontrolna,
- migracja na pelne tabele PostgreSQL bedzie mozliwa pozniej.

## 4. Przed prawdziwym wdrozeniem

Klucz tajny, ktory byl kiedykolwiek wklejony w czat, warto obrocic w Supabase i w hostingu zapisac juz nowy. Do produkcji najlepiej bedzie pozniej rozbic dane na osobne tabele: uczestnicy, platnosci, stoliki, admini i logi zmian.
