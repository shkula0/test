# Trener – aplikacja dla podopiecznych

Aplikacja na telefon (PWA) dla trenera personalnego i jego podopiecznych.

- **Trener** układa plany treningowe (dni, ćwiczenia, superserie A1/A2/A3, każda seria osobno: powtórzenia, ciężar, czas, intensywność; przerwy, wskazówki) i widzi postępy każdego podopiecznego.
- **Podopieczny** widzi swoje plany i zapisuje pomiary ciała – samodzielne (waga, wzrost, obwody; BMI liczone automatycznie) i z wagi do analizy składu ciała (PBF, BFM, SMM, tłuszcz trzewny, TBW) – oraz wyniki w ćwiczeniach. Na tej podstawie powstają wykresy, m.in. szacowanego ciężaru maksymalnego (1RM).
- **Biblioteka ćwiczeń**: bazowy zestaw ponad 40 ćwiczeń, a do tego własne ćwiczenia trenera ze zdjęciem lub filmem (plik z telefonu albo link do YouTube) i opisem techniki. Ćwiczenie można udostępnić innym trenerom. Podopieczny klika ćwiczenie w planie i widzi, jak je wykonać.
- **Dziennik treningów**: trening startuje z wybranego dnia planu ze wszystkimi ćwiczeniami; w polach na szaro widać wynik z poprzedniego treningu z tego planu (albo wartości z planu), a stuknięcie numeru serii odhacza ją i zatwierdza szare wartości. Treningi zapisuje trener albo podopieczny, a serie trafiają do wykresów siły.
- **Podsumowanie** na start: największy progres, tonaż tygodnia i miesiąca z porównaniem do poprzedniego okresu, liczba treningów, rekordy z 30 dni i seria tygodni z treningiem.
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
2. Otwórz **SQL Editor → New query**, wklej całą zawartość pliku [`supabase/schema.sql`](supabase/schema.sql) i kliknij **Run**. Potem w nowych zapytaniach zrób to samo kolejno z plikami [`supabase/002_biblioteka_cwiczen.sql`](supabase/002_biblioteka_cwiczen.sql) (biblioteka ćwiczeń i miejsce na zdjęcia/filmy) [`supabase/003_superserie.sql`](supabase/003_superserie.sql) (superserie w planach), [`supabase/004_pomiary.sql`](supabase/004_pomiary.sql) (rozszerzone pomiary ciała), [`supabase/005_treningi.sql`](supabase/005_treningi.sql) (dziennik treningów) i [`supabase/006_serie_w_planie.sql`](supabase/006_serie_w_planie.sql) (serie rozpisane w planie).
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

## Pomysły na kolejne wersje

- Kopiowanie planu do innego podopiecznego / szablony planów
- Wiadomości i komentarze trenera do treningów
- Powiadomienia push o nowym planie
