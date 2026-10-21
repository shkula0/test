-- Rutyny „na wolną chwilę” (mobilność, postawa, rozciąganie…) i ich wykonania.
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run. Można uruchomić ponownie.

create table if not exists public.routines (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  category     text not null default '',
  duration_min int check (duration_min > 0),
  level        text not null default '',
  description  text not null default '',
  video_url    text not null default '',
  media_url    text,
  media_path   text,
  media_type   text check (media_type in ('image', 'video')),
  -- lista ćwiczeń: [{ "name": "...", "exercise_id": "...", "amount": "45 s" }]
  items        jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists routines_coach_idx on public.routines (coach_id);

drop trigger if exists routines_touch on public.routines;
create trigger routines_touch before update on public.routines
  for each row execute function public.touch_updated_at();

create table if not exists public.routine_completions (
  id           uuid primary key default gen_random_uuid(),
  routine_id   uuid not null references public.routines (id) on delete cascade,
  client_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  completed_on date not null default current_date,
  created_at   timestamptz not null default now()
);
create index if not exists routine_completions_client_idx on public.routine_completions (client_id, completed_on);

alter table public.routines            enable row level security;
alter table public.routine_completions enable row level security;

-- Rutyny widzi trener, który je stworzył, i jego podopieczni. Edytuje tylko autor.
drop policy if exists routines_select on public.routines;
create policy routines_select on public.routines for select to authenticated
  using (coach_id = auth.uid() or coach_id = public.my_coach_id());

drop policy if exists routines_write on public.routines;
create policy routines_write on public.routines for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'));

-- Wykonania zapisuje i widzi podopieczny oraz jego trener.
drop policy if exists routine_completions_all on public.routine_completions;
create policy routine_completions_all on public.routine_completions for all to authenticated
  using (client_id = auth.uid() or public.is_my_client(client_id))
  with check ((client_id = auth.uid() or public.is_my_client(client_id))
    and exists (select 1 from public.routines r where r.id = routine_id));
