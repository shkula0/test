-- Dziennik treningów: wykonane treningi z planu i serie (ciężar × powtórzenia).
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run. Można uruchomić ponownie.

create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.profiles (id) on delete cascade,
  plan_id      uuid references public.plans (id) on delete set null,
  plan_name    text not null default '',
  day          text not null default '',
  performed_on date not null default current_date,
  notes        text not null default '',
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists workouts_client_idx on public.workouts (client_id, performed_on desc);

drop trigger if exists workouts_touch on public.workouts;
create trigger workouts_touch before update on public.workouts
  for each row execute function public.touch_updated_at();

create table if not exists public.workout_sets (
  id            uuid primary key default gen_random_uuid(),
  workout_id    uuid not null references public.workouts (id) on delete cascade,
  position      int not null default 0,          -- kolejność ćwiczenia w treningu
  label         text not null default '',         -- A, B1, B2…
  exercise_name text not null,
  exercise_id   uuid references public.exercises (id) on delete set null,
  set_number    int not null check (set_number > 0),
  weight        numeric(6, 2) check (weight >= 0),
  reps          int check (reps >= 0),
  done          boolean not null default false,
  note          text not null default ''          -- notatka do ćwiczenia (zapisywana przy 1. serii)
);
create index if not exists workout_sets_workout_idx on public.workout_sets (workout_id, position, set_number);

alter table public.workouts     enable row level security;
alter table public.workout_sets enable row level security;

-- Trening widzi i zapisuje podopieczny oraz jego trener.
drop policy if exists workouts_all on public.workouts;
create policy workouts_all on public.workouts for all to authenticated
  using (client_id = auth.uid() or public.is_my_client(client_id))
  with check (client_id = auth.uid() or public.is_my_client(client_id));

drop policy if exists workout_sets_all on public.workout_sets;
create policy workout_sets_all on public.workout_sets for all to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id))
  with check (exists (select 1 from public.workouts w where w.id = workout_id));
