-- Serie rozpisane w planie (każda seria: powtórzenia, kg, czas, intensywność)
-- oraz czas serii w dzienniku treningów.
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run. Można uruchomić ponownie.

alter table public.plan_exercises
  add column if not exists set_targets jsonb not null default '[]'::jsonb;

alter table public.workout_sets
  add column if not exists duration_s int check (duration_s >= 0);
