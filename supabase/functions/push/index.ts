// Funkcja Supabase (Edge Function) „push”: wysyła powiadomienia na telefony.
// Wdrożenie: Supabase → Edge Functions → Deploy a new function → Via Editor, nazwa „push”, wklej ten plik.
// Klucze VAPID tworzą się same przy pierwszym użyciu (tabela push_keys z pliku 011_powiadomienia.sql).
//
// Wywołania z aplikacji:
//   { action: "public-key" } → { publicKey } – klucz potrzebny telefonowi do włączenia powiadomień,
//   { to: ["<id użytkownika>", …] albo "clients", title, body, url } → { sent }.
// Trener może pisać do swoich podopiecznych (i do siebie), podopieczny – tylko do swojego trenera.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUBJECT = 'https://shkula0.github.io/test/';

// Para kluczy VAPID: z bazy, a przy pierwszym użyciu – nowa (przy równoczesnym tworzeniu wygrywa pierwsza zapisana).
// deno-lint-ignore no-explicit-any
async function vapidKeys(admin: any) {
  const { data } = await admin.from('push_keys').select('public_key, private_key').eq('id', 1).maybeSingle();
  if (data) return data;
  const keys = webpush.generateVAPIDKeys();
  await admin.from('push_keys').insert({ id: 1, public_key: keys.publicKey, private_key: keys.privateKey });
  const { data: saved } = await admin.from('push_keys').select('public_key, private_key').eq('id', 1).single();
  return saved;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Tylko POST' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Kto wysyła: użytkownik z tokenu logowania.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData } = await admin.auth.getUser(token);
  const senderId = userData?.user?.id;
  if (!senderId) return json(401, { error: 'Zaloguj się ponownie.' });

  let payload: { action?: string; to?: string[] | string; title?: string; body?: string; url?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'Niepoprawne dane.' });
  }
  const keys = await vapidKeys(admin);
  if (!keys) return json(500, { error: 'Brak tabeli push_keys – uruchom plik 011_powiadomienia.sql.' });
  if (payload.action === 'public-key') return json(200, { publicKey: keys.public_key });

  const title = String(payload.title ?? '').slice(0, 120).trim();
  const body = String(payload.body ?? '').slice(0, 500).trim();
  const url = typeof payload.url === 'string' && payload.url.startsWith('#/') ? payload.url : '#/';
  if (!title) return json(400, { error: 'Brak tytułu powiadomienia.' });

  const { data: sender } = await admin.from('profiles').select('id, role, coach_id').eq('id', senderId).single();
  if (!sender) return json(403, { error: 'Brak profilu.' });

  // Do kogo wolno wysłać.
  let allowed: string[];
  if (sender.role === 'coach') {
    const { data: clients } = await admin.from('profiles').select('id').eq('coach_id', sender.id);
    allowed = [sender.id, ...(clients ?? []).map((c) => c.id)];
  } else {
    allowed = sender.coach_id ? [sender.coach_id] : [];
  }
  const wanted = payload.to === 'clients'
    ? allowed.filter((id) => id !== sender.id)
    : (Array.isArray(payload.to) ? payload.to : []).filter((id) => allowed.includes(id));
  if (!wanted.length) return json(200, { sent: 0 });

  const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', wanted);
  const message = JSON.stringify({ title, body, url });
  let sent = 0;
  await Promise.all((subs ?? []).map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
        {
          TTL: 24 * 3600,
          urgency: 'normal',
          vapidDetails: { subject: SUBJECT, publicKey: keys.public_key, privateKey: keys.private_key },
        },
      );
      sent += 1;
    } catch (error) {
      // Telefon wycofał zgodę albo odinstalował aplikację – usuwamy nieaktualną subskrypcję.
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id);
      else console.error('push error', status, (error as Error).message);
    }
  }));
  return json(200, { sent });
});
