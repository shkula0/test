-- Biblioteka ćwiczeń ze zdjęciami i filmami.
-- Uruchom w Supabase: SQL Editor → New query → wklej cały plik → Run.
-- Wymaga wcześniejszego uruchomienia schema.sql. Można uruchomić ponownie bez szkody.

-- ============================================================
-- Tabela ćwiczeń
-- ============================================================

create table if not exists public.exercises (
  id          uuid primary key default gen_random_uuid(),
  -- null = ćwiczenie z bazowego zestawu (nikt go nie edytuje)
  coach_id    uuid default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  category    text not null default '',
  description text not null default '',
  media_url   text,
  media_path  text,
  media_type  text check (media_type in ('image', 'video')),
  video_url   text not null default '',
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists exercises_coach_idx on public.exercises (coach_id);

drop trigger if exists exercises_touch on public.exercises;
create trigger exercises_touch before update on public.exercises
  for each row execute function public.touch_updated_at();

alter table public.plan_exercises
  add column if not exists exercise_id uuid references public.exercises (id) on delete set null;

-- ============================================================
-- Uprawnienia: każdy zalogowany widzi bazowe i udostępnione ćwiczenia,
-- trener swoje, a podopieczny także ćwiczenia swojego trenera.
-- Edytować i usuwać można tylko własne.
-- ============================================================

alter table public.exercises enable row level security;

drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated
  using (coach_id is null or is_public or coach_id = auth.uid() or coach_id = public.my_coach_id());

drop policy if exists exercises_insert on public.exercises;
create policy exercises_insert on public.exercises for insert to authenticated
  with check (coach_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'));

drop policy if exists exercises_update on public.exercises;
create policy exercises_update on public.exercises for update to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

drop policy if exists exercises_delete on public.exercises;
create policy exercises_delete on public.exercises for delete to authenticated
  using (coach_id = auth.uid());

-- ============================================================
-- Miejsce na zdjęcia i filmy (Supabase Storage)
-- Pliki są publiczne do odczytu (link zna tylko aplikacja),
-- a każdy trener zapisuje wyłącznie w swoim folderze.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-media', 'exercise-media', true, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exercise_media_insert on storage.objects;
create policy exercise_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'exercise-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists exercise_media_update on storage.objects;
create policy exercise_media_update on storage.objects for update to authenticated
  using (bucket_id = 'exercise-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists exercise_media_delete on storage.objects;
create policy exercise_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'exercise-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Bazowy zestaw ćwiczeń (dodawany tylko raz)
-- ============================================================

insert into public.exercises (coach_id, name, category)
select null, v.name, v.category
from (values
  ('Przysiad ze sztangą', 'Nogi'),
  ('Przysiad przedni', 'Nogi'),
  ('Przysiad goblet', 'Nogi'),
  ('Przysiad bułgarski', 'Nogi'),
  ('Wykroki chodzone', 'Nogi'),
  ('Wypychanie na suwnicy', 'Nogi'),
  ('Prostowanie nóg na maszynie', 'Nogi'),
  ('Uginanie nóg na maszynie', 'Nogi'),
  ('Wspięcia na palce', 'Nogi'),
  ('Martwy ciąg', 'Pośladki i tył uda'),
  ('Martwy ciąg rumuński', 'Pośladki i tył uda'),
  ('Hip thrust', 'Pośladki i tył uda'),
  ('Most biodrowy', 'Pośladki i tył uda'),
  ('Odwodzenie nogi na wyciągu', 'Pośladki i tył uda'),
  ('Wyciskanie sztangi leżąc', 'Klatka'),
  ('Wyciskanie hantli na skosie', 'Klatka'),
  ('Rozpiętki z hantlami', 'Klatka'),
  ('Pompki', 'Klatka'),
  ('Pompki na poręczach', 'Klatka'),
  ('Podciąganie', 'Plecy'),
  ('Podciąganie z gumą', 'Plecy'),
  ('Ściąganie drążka do klatki', 'Plecy'),
  ('Wiosłowanie sztangą', 'Plecy'),
  ('Wiosłowanie hantlem', 'Plecy'),
  ('Wiosłowanie na wyciągu siedząc', 'Plecy'),
  ('Wyciskanie żołnierskie', 'Barki'),
  ('Wyciskanie hantli nad głowę', 'Barki'),
  ('Unoszenie hantli bokiem', 'Barki'),
  ('Face pull', 'Barki'),
  ('Uginanie ramion ze sztangą', 'Ramiona'),
  ('Uginanie ramion z hantlami (młotkowe)', 'Ramiona'),
  ('Prostowanie ramion na wyciągu', 'Ramiona'),
  ('Wyciskanie francuskie', 'Ramiona'),
  ('Plank', 'Brzuch i core'),
  ('Plank bokiem', 'Brzuch i core'),
  ('Dead bug', 'Brzuch i core'),
  ('Unoszenie nóg w zwisie', 'Brzuch i core'),
  ('Pallof press', 'Brzuch i core'),
  ('Bieżnia', 'Kondycja'),
  ('Rower stacjonarny', 'Kondycja'),
  ('Wioślarz (ergometr)', 'Kondycja'),
  ('Skakanka', 'Kondycja'),
  ('Burpees', 'Kondycja')
) as v (name, category)
where not exists (select 1 from public.exercises e where e.coach_id is null and e.name = v.name);
