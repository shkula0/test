-- Trener może układać plany sam dla siebie, a w dzienniku treningów zapisuje się dystans biegu.
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run. Można uruchomić ponownie.

-- Plany: trener zapisuje plany swoim podopiecznym oraz sobie samemu.
drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and (public.is_my_client(client_id) or client_id = auth.uid()));

-- Odcinek biegu: dystans w metrach (czas w istniejącej kolumnie duration_s).
alter table public.workout_sets
  add column if not exists distance_m numeric(8, 1) check (distance_m >= 0);
