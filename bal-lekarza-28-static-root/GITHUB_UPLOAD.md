# Instrukcja wrzucenia na GitHuba

1. Rozpakuj paczke `bal-lekarza-28-static-root.zip`.
2. Wejdz do rozpakowanego folderu.
3. Zaznacz cala zawartosc folderu, nie sam folder.
4. Wrzuć do glownego katalogu repo GitHub.
5. W repo ma byc widoczny plik `index.html` w pierwszym poziomie.
6. Wlacz GitHub Pages albo podepnij repo do Vercel/Netlify jako static site.

Test po wrzuceniu:

- strona otwiera sie bez Rendera,
- konsola nie szuka `/api/...`,
- logowanie otwiera Supabase,
- po zalogowaniu admin widzi zakladke `Admin`.
