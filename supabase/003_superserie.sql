-- Superserie w planach: ćwiczenie oznaczone jako superset wykonuje się
-- razem z poprzednim (A1, A2, A3…).
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run. Można uruchomić ponownie.

alter table public.plan_exercises
  add column if not exists superset boolean not null default false;
