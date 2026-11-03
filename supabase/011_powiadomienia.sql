-- Powiadomienia push: zapisane zgody (subskrypcje) z telefonów użytkowników.
-- Uruchom w Supabase: SQL Editor → New query → wklej → Run. Można uruchomić ponownie.
-- Wysyłką zajmuje się funkcja supabase/functions/push (Edge Functions).

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Klucze VAPID (podpis powiadomień). Funkcja „push” tworzy je sama przy pierwszym użyciu.
-- Brak reguł dostępu = tabelę czyta tylko serwer (klucz serwisowy), nikt z aplikacji.
create table if not exists public.push_keys (
  id          int primary key default 1 check (id = 1),
  public_key  text not null,
  private_key text not null,
  created_at  timestamptz not null default now()
);
alter table public.push_keys enable row level security;

-- Każdy widzi i zmienia tylko subskrypcje swoich urządzeń. Funkcja wysyłająca używa klucza serwisowego.
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Zapis zgody z telefonu. Ten sam telefon mógł wcześniej należeć do innego konta (wylogowanie i logowanie
-- na inne) – wtedy subskrypcja przechodzi na osobę zalogowaną teraz.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = public as $$
  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
