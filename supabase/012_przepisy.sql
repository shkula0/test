-- Przepisy od trenera: film lub zdjęcie, składniki, kroki, czas, porcje i makro na porcję.
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run. Można uruchomić ponownie.

create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  category     text not null default '',
  prep_min     int check (prep_min > 0),
  servings     int check (servings > 0),
  kcal         numeric(7, 1) check (kcal >= 0),
  protein      numeric(6, 1) check (protein >= 0),
  carbs        numeric(6, 1) check (carbs >= 0),
  fat          numeric(6, 1) check (fat >= 0),
  description  text not null default '',
  video_url    text not null default '',
  media_url    text,
  media_path   text,
  media_type   text check (media_type in ('image', 'video')),
  -- składniki: [{ "name": "Płatki owsiane", "amount": "60 g" }], kroki: ["Zagotuj mleko…", …]
  ingredients  jsonb not null default '[]'::jsonb,
  steps        jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists recipes_coach_idx on public.recipes (coach_id);

drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();

alter table public.recipes enable row level security;

-- Przepisy widzi trener, który je dodał, i jego podopieczni. Zmienia tylko autor.
drop policy if exists recipes_select on public.recipes;
create policy recipes_select on public.recipes for select to authenticated
  using (coach_id = auth.uid() or coach_id = public.my_coach_id());

drop policy if exists recipes_write on public.recipes;
create policy recipes_write on public.recipes for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'));
