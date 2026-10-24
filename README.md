# Trener – aplikacja dla podopiecznych

Aplikacja na telefon (PWA) dla trenera personalnego i jego podopiecznych.

- **Trener** układa plany treningowe (dni, ćwiczenia, superserie A1/A2/A3, każda seria osobno: zakres powtórzeń lub czas i intensywność 50–100%; przerwy, wskazówki – ciężar wynika z progresu) i widzi postępy każdego podopiecznego.
- **Podopieczny** widzi swoje plany i zapisuje pomiary ciała – samodzielne (waga, wzrost, obwody; BMI liczone automatycznie) i z wagi do analizy składu ciała (PBF, BFM, SMM, tłuszcz trzewny, TBW) – oraz wyniki w ćwiczeniach. Na tej podstawie powstają wykresy, m.in. szacowanego ciężaru maksymalnego (1RM).
- **Biblioteka ćwiczeń**: bazowy zestaw ponad 40 ćwiczeń, a do tego własne ćwiczenia trenera ze zdjęciem lub filmem (plik z telefonu albo link do YouTube) i opisem techniki. Ćwiczenie można udostępnić innym trenerom. Podopieczny klika ćwiczenie w planie i widzi, jak je wykonać.
- **Dziennik treningów**: trening startuje z wybranego dnia planu ze wszystkimi ćwiczeniami; w polach na szaro widać wynik z poprzedniego treningu z tego planu (przy pierwszym treningu pola są puste), a stuknięcie numeru serii odhacza ją i zatwierdza szare wartości. Treningi zapisuje trener albo podopieczny, a serie trafiają do wykresów siły.
- **Trening dowolny** (bez planu): ćwiczenia dodaje się w trakcie; ostatni ciężar w każdym ćwiczeniu jest pamiętany niezależnie od tego, czy był robiony w planie, czy w treningu dowolnym.
- **Bieg w planie**: przy ćwiczeniu zaznacza się „Bieg” i rozpisuje odcinki (dystans, czas, tempo, strefa Z1–Z5), np. 6 × 400 m w Z4 albo 5 km w Z2. W treningu wpisuje się km i czas (mm:ss), a tempo na km liczy się samo; kilometry z miesiąca widać w podsumowaniu.
- **Moje treningi**: trener może układać plany i zapisywać treningi także dla siebie (karta „Moje treningi” na górze listy podopiecznych).
- **Bloki w planie**: EMOM, AMRAP, For Time i Tabata – format ustawia się przy pierwszym ćwiczeniu grupy, a w treningu wpisuje się wynik bloku (z podglądem poprzedniego).
- **Podsumowanie** na start: największy progres, tonaż tygodnia i miesiąca z porównaniem do poprzedniego okresu, liczba treningów, rekordy z 30 dni i seria tygodni z treningiem.
- **Pobieranie wyników**: w zakładce Postępy raport PDF (podsumowanie, progres, pomiary, historia treningów) i plik Excel ze wszystkimi danymi.
- **Rutyny na wolną chwilę**: trener tworzy krótkie treningi (mobilność, postawa, rozciąganie…) z filmem i listą ćwiczeń; podopieczni oglądają, ćwiczą i odhaczają „Zrobione”, co liczy się do serii.
- Podopieczni dołączają do trenera przez **link z kodem zaproszenia**.
- Aplikację instaluje się z przeglądarki na ekranie głównym telefonu (Android i iPhone), bez sklepu z aplikacjami.

## Szybki podgląd (tryb demo)

Bez żadnej konfiguracji aplikacja działa w trybie demo: dane są przykładowe i zapisują się tylko w danej przeglądarce.

```bash
python3 -m http.server 8000
# otwórz http://localhost:8000
```

## Uruchomienie produkcyjne – krok po kroku

### 1. Baza danych (Supabase, darmowy plan)

1. Załóż konto na <https://supabase.com> i utwórz nowy projekt (region np. *Central EU – Frankfurt*).
2. Otwórz **SQL Editor → New query**, wklej całą zawartość pliku [`supabase/schema.sql`](supabase/schema.sql) i kliknij **Run**. Potem w nowych zapytaniach zrób to samo kolejno z plikami [`supabase/002_biblioteka_cwiczen.sql`](supabase/002_biblioteka_cwiczen.sql) (biblioteka ćwiczeń i miejsce na zdjęcia/filmy) [`supabase/003_superserie.sql`](supabase/003_superserie.sql) (superserie w planach), [`supabase/004_pomiary.sql`](supabase/004_pomiary.sql) (rozszerzone pomiary ciała), [`supabase/005_treningi.sql`](supabase/005_treningi.sql) (dziennik treningów), [`supabase/006_serie_w_planie.sql`](supabase/006_serie_w_planie.sql) (serie rozpisane w planie), [`supabase/007_rutyny.sql`](supabase/007_rutyny.sql) (rutyny na wolną chwilę) [`supabase/008_bloki_i_trening_dowolny.sql`](supabase/008_bloki_i_trening_dowolny.sql) (bloki EMOM/AMRAP/For Time/Tabata) i [`supabase/009_wlasne_treningi_i_bieg.sql`](supabase/009_wlasne_treningi_i_bieg.sql) (plany trenera dla siebie i dystans biegu).
3. W **Authentication → Sign In / Providers → Email** zdecyduj o potwierdzaniu adresu email:
   - wyłącz **Confirm email**, jeśli podopieczni mają od razu korzystać z aplikacji po rejestracji, **albo**
   - zostaw włączone. Wtedy po rejestracji przyjdzie mail z linkiem. Ustaw wcześniej **Authentication → URL Configuration → Site URL** na adres swojej aplikacji (krok 3).
4. W **Authentication → URL Configuration** ustaw **Site URL** na adres aplikacji (np. `https://shkula0.github.io/test/`) i dodaj ten sam adres w **Redirect URLs** – inaczej link „Nie pamiętam hasła” z maila nie wróci do aplikacji.
5. W **Project Settings → API** skopiuj **Project URL** i klucz **anon public**.

### 2. Konfiguracja aplikacji

Wpisz skopiowane wartości do pliku [`config.js`](config.js):

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://twoj-projekt.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
};
```

Klucz *anon* jest publiczny z założenia. Dostęp do danych chronią reguły Row Level Security ze `schema.sql`: trener widzi tylko swoich podopiecznych, a podopieczny tylko swoje dane.

### 3. Publikacja (hosting)

Aplikacja to zwykłe pliki statyczne, więc wystarczy dowolny darmowy hosting z HTTPS:

- **GitHub Pages**: w repozytorium **Settings → Pages → Source: Deploy from a branch**, wybierz gałąź i folder `/ (root)`. Na darmowym planie GitHub repozytorium musi być publiczne.
- **Netlify** / **Cloudflare Pages**: przeciągnij folder projektu na <https://app.netlify.com/drop> albo podłącz repozytorium.

### 4. Pierwsze użycie

1. Otwórz adres aplikacji i zarejestruj się, wybierając **Trener**.
2. W zakładce **Podopieczni** kliknij **Zaproś** i wyślij link podopiecznym (SMS, WhatsApp, Messenger…). Kod trenera wpisze się w formularzu automatycznie.
3. Podopieczny zakłada konto i instaluje aplikację:
   - **Android (Chrome)**: menu ⋮ → *Zainstaluj aplikację* lub przycisk w zakładce *Konto*.
   - **iPhone (Safari)**: *Udostępnij* → *Do ekranu początkowego*.
   - **Samsung**: instaluj przez **Chrome**, nie przez Samsung Internet – Google Play Protect blokuje aplikacje zainstalowane z przeglądarki Samsunga. Aplikacja sama to podpowiada i ma przycisk „Otwórz w Chrome”.

## Aktualizacje

Po zmianie plików podbij wersję w [`sw.js`](sw.js) (`const CACHE = 'trener-v2'`), aby telefony pobrały nową wersję aplikacji.

## Struktura projektu

| Plik / folder | Zawartość |
| --- | --- |
| `index.html`, `manifest.webmanifest`, `sw.js` | Szkielet PWA, instalacja i praca offline |
| `config.js` | Dane połączenia z Supabase (puste = tryb demo) |
| `js/app.js` | Ekrany i nawigacja |
| `js/library.js`, `js/media.js` | Biblioteka ćwiczeń, zdjęcia i filmy |
| `js/measurements.js` | Definicje pomiarów ciała, BMI, kafelki i formularze |
| `js/workouts.js`, `js/plan-utils.js` | Dziennik treningów, „Poprzednio”, oznaczenia A/B1/B2 |
| `js/summary.js` | Podsumowanie: tonaż, treningi, seria, progres, rekordy |
| `js/data/` | Warstwa danych: `supabase.js` (produkcja), `demo.js` (localStorage) |
| `js/chart.js` | Wykresy SVG |
| `supabase/schema.sql` | Tabele, rejestracja z kodem trenera, uprawnienia (RLS) |
| `supabase/002_biblioteka_cwiczen.sql` | Biblioteka ćwiczeń, bazowy zestaw, Storage na zdjęcia i filmy |
| `supabase/003_superserie.sql` | Superserie (A1, A2, A3) w planach |
| `supabase/004_pomiary.sql` | Obwody, wzrost i wyniki z wagi składu ciała |
| `supabase/005_treningi.sql` | Dziennik treningów: treningi i serie |
| `supabase/006_serie_w_planie.sql` | Każda seria w planie osobno (powt., kg, czas, intensywność), czas serii w treningu |
| `vendor/supabase.js` | Biblioteka supabase-js 2.118.0 (licencja MIT) |
| `js/export.js` | Eksport do PDF i Excela |
| `js/routines.js` | Rutyny na wolną chwilę |
| `supabase/007_rutyny.sql` | Rutyny i ich wykonania |
| `supabase/008_bloki_i_trening_dowolny.sql` | Formaty bloków w planie i wyniki bloków w treningu |
| `supabase/009_wlasne_treningi_i_bieg.sql` | Plany trenera dla samego siebie, dystans odcinków biegowych |
| `vendor/jspdf*.js`, `vendor/xlsx.mini.min.js`, `vendor/fonts/` | jsPDF 4.2.1 + AutoTable 5.0.9 (MIT), SheetJS 0.18.5 (Apache-2.0), czcionka DejaVu Sans z polskimi znakami – ładowane tylko przy eksporcie |

## Pomysły na kolejne wersje

- Kopiowanie planu do innego podopiecznego / szablony planów
- Wiadomości i komentarze trenera do treningów
- Powiadomienia push o nowym planie
