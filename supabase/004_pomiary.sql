-- Rozszerzone pomiary ciała: obwody, wzrost i wyniki z wagi do analizy składu ciała.
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run. Można uruchomić ponownie.

alter table public.body_metrics
  add column if not exists height       numeric(5, 1),
  add column if not exists hips         numeric(5, 1),
  add column if not exists chest        numeric(5, 1),
  add column if not exists arm          numeric(5, 1),
  add column if not exists forearm      numeric(5, 1),
  add column if not exists thigh        numeric(5, 1),
  add column if not exists calf         numeric(5, 1),
  add column if not exists fat_mass     numeric(5, 1),
  add column if not exists muscle_mass  numeric(5, 1),
  add column if not exists visceral_fat numeric(5, 1),
  add column if not exists body_water   numeric(5, 1),
  -- self = pomiar samodzielny, scale = wynik z wagi do analizy składu ciała
  add column if not exists source       text not null default 'self' check (source in ('self', 'scale'));
