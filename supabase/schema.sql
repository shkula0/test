-- Schemat bazy danych aplikacji trenerskiej.
-- Uruchom cały plik w Supabase: SQL Editor → New query → wklej → Run.

-- ============================================================
-- Tabele
-- ============================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        text not null check (role in ('coach', 'client')),
  coach_id    uuid references public.profiles (id) on delete set null,
  invite_code text unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.plans (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  client_id  uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plans_client_idx on public.plans (client_id);

create table if not exists public.plan_exercises (
  id       uuid primary key default gen_random_uuid(),
  plan_id  uuid not null references public.plans (id) on delete cascade,
  position int  not null default 0,
  day      text not null default '',
  name     text not null,
  sets     text not null default '',
  reps     text not null default '',
  weight   text not null default '',
  rest     text not null default '',
  notes    text not null default ''
);
create index if not exists plan_exercises_plan_idx on public.plan_exercises (plan_id, position);

create table if not exists public.body_metrics (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles (id) on delete cascade,
  measured_on date not null default current_date,
  weight      numeric(5, 1),
  waist       numeric(5, 1),
  body_fat    numeric(4, 1),
  note        text not null default '',
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists body_metrics_client_idx on public.body_metrics (client_id, measured_on);

create table if not exists public.lift_records (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.profiles (id) on delete cascade,
  performed_on date not null default current_date,
  exercise     text not null,
  weight       numeric(6, 2) not null,
  reps         int not null check (reps > 0),
  note         text not null default '',
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index if not exists lift_records_client_idx on public.lift_records (client_id, performed_on);

-- ============================================================
-- Funkcje pomocnicze (security definer omija RLS, więc nie ma rekurencji w politykach)
-- ============================================================

create or replace function public.my_coach_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coach_id from profiles where id = auth.uid();
$$;

create or replace function public.is_my_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_client and coach_id = auth.uid());
$$;

-- Pozwala sprawdzić kod trenera przed rejestracją (zwraca tylko imię i nazwisko).
create or replace function public.coach_name_for_code(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select full_name from profiles where role = 'coach' and invite_code = upper(trim(p_code));
$$;
grant execute on function public.coach_name_for_code(text) to anon, authenticated;

-- Tworzy profil przy rejestracji na podstawie danych z formularza.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role  text := coalesce(new.raw_user_meta_data ->> 'role', 'client');
  v_coach uuid;
  v_code  text;
begin
  if v_role not in ('coach', 'client') then
    v_role := 'client';
  end if;

  if v_role = 'client' then
    select id into v_coach from profiles
    where role = 'coach' and invite_code = upper(trim(new.raw_user_meta_data ->> 'coach_code'));
    if v_coach is null then
      raise exception 'Nieprawidłowy kod trenera';
    end if;
  else
    loop
      v_code := upper(substr(md5(random()::text), 1, 6));
      exit when not exists (select 1 from profiles where invite_code = v_code);
    end loop;
  end if;

  insert into profiles (id, full_name, role, coach_id, invite_code)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), v_role, v_coach, v_code);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Row Level Security: trener widzi tylko swoich podopiecznych,
-- podopieczny tylko swoje dane i profil swojego trenera.
-- ============================================================

alter table public.profiles       enable row level security;
alter table public.plans          enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.body_metrics   enable row level security;
alter table public.lift_records   enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or coach_id = auth.uid() or id = public.my_coach_id());

drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to authenticated
  using (coach_id = auth.uid() or client_id = auth.uid());

drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and public.is_my_client(client_id));

drop policy if exists plan_exercises_select on public.plan_exercises;
create policy plan_exercises_select on public.plan_exercises for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id));

drop policy if exists plan_exercises_write on public.plan_exercises;
create policy plan_exercises_write on public.plan_exercises for all to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and p.coach_id = auth.uid()))
  with check (exists (select 1 from public.plans p where p.id = plan_id and p.coach_id = auth.uid()));

drop policy if exists body_metrics_all on public.body_metrics;
create policy body_metrics_all on public.body_metrics for all to authenticated
  using (client_id = auth.uid() or public.is_my_client(client_id))
  with check (client_id = auth.uid() or public.is_my_client(client_id));

drop policy if exists lift_records_all on public.lift_records;
create policy lift_records_all on public.lift_records for all to authenticated
  using (client_id = auth.uid() or public.is_my_client(client_id))
  with check (client_id = auth.uid() or public.is_my_client(client_id));
