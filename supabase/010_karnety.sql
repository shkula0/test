-- Karnety podopiecznych (np. 8 treningów) i odbite treningi. Karnet kończy się, gdy wykorzysta się treningi.
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run. Można uruchomić ponownie.

create table if not exists public.passes (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  client_id  uuid not null references public.profiles (id) on delete cascade,
  sessions   int not null check (sessions > 0 and sessions <= 100),
  starts_on  date not null default current_date,
  ends_on    date,
  price      numeric(8, 2) check (price >= 0),
  paid       boolean not null default false,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
-- Karnety liczone tylko liczbą treningów – data końca nie jest potrzebna (dla baz z pierwszą wersją tego pliku).
alter table public.passes alter column ends_on drop not null;

create index if not exists passes_client_idx on public.passes (client_id, ends_on);
create index if not exists passes_coach_idx on public.passes (coach_id);

-- Jeden odbity trening. Odbicie z zapisanego treningu znika razem z tym treningiem.
create table if not exists public.pass_uses (
  id         uuid primary key default gen_random_uuid(),
  pass_id    uuid not null references public.passes (id) on delete cascade,
  used_on    date not null default current_date,
  workout_id uuid references public.workouts (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists pass_uses_pass_idx on public.pass_uses (pass_id);

alter table public.passes    enable row level security;
alter table public.pass_uses enable row level security;

-- Karnet widzi trener i podopieczny; zakłada i zmienia tylko trener (swoim podopiecznym albo sobie).
drop policy if exists passes_select on public.passes;
create policy passes_select on public.passes for select to authenticated
  using (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists passes_write on public.passes;
create policy passes_write on public.passes for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and (public.is_my_client(client_id) or client_id = auth.uid()));

drop policy if exists pass_uses_select on public.pass_uses;
create policy pass_uses_select on public.pass_uses for select to authenticated
  using (exists (select 1 from public.passes p where p.id = pass_id and (p.coach_id = auth.uid() or p.client_id = auth.uid())));

drop policy if exists pass_uses_write on public.pass_uses;
create policy pass_uses_write on public.pass_uses for all to authenticated
  using (exists (select 1 from public.passes p where p.id = pass_id and p.coach_id = auth.uid()))
  with check (exists (select 1 from public.passes p where p.id = pass_id and p.coach_id = auth.uid()));
