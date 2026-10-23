-- Bloki w planie (EMOM, AMRAP, For Time, Tabata) i ich wyniki w dzienniku treningów.
-- Trening dowolny (bez planu) nie wymaga zmian w bazie – to trening bez przypisanego planu.
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run. Można uruchomić ponownie.

-- Format bloku zapisany przy pierwszym ćwiczeniu bloku, np. {"type":"amrap","minutes":12}
alter table public.plan_exercises
  add column if not exists block jsonb;

-- W treningu: kopia formatu bloku i wynik (np. „5 + 7”, „12:40”) przy pierwszym ćwiczeniu bloku
alter table public.workout_sets
  add column if not exists block jsonb,
  add column if not exists block_result text not null default '';
