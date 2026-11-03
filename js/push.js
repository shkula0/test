// Powiadomienia push: zgoda na tym telefonie i wysyłanie powiadomień do innych użytkowników.

import { api } from './data/index.js';
import { icons } from './icons.js';
import { $, html, toast } from './ui.js';

const DISMISS_KEY = 'trener-push-dismissed';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function keyBytes(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Bez czekania na „ready” – gdy service worker nie działa, nie blokujemy np. wylogowania.
async function registration() {
  return navigator.serviceWorker?.getRegistration() ?? null;
}

// unsupported | demo | ios-install (iPhone: najpierw dodać do ekranu) | denied | on | off
export async function pushState() {
  if (api.mode === 'demo') return 'demo';
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Powiadomienia są zablokowane – zezwól na nie w ustawieniach telefonu.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await api.pushPublicKey()) });
  await api.savePushSubscription(sub.toJSON());
}

export async function disablePush() {
  if (api.mode === 'demo') return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.deletePushSubscription(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

// Wysyłka w tle: błąd powiadomienia nigdy nie przerywa zapisu treningu, planu czy karnetu.
export function notify(to, title, body, url = '#/') {
  if (api.mode === 'demo' || !to || (Array.isArray(to) && !to.length)) return;
  api.sendPush({ to, title, body, url }).catch((error) => console.warn('Powiadomienie nie zostało wysłane:', error.message));
}

const STATE_TEXT = {
  on: 'Włączone na tym telefonie.',
  off: 'Wyłączone na tym telefonie.',
  denied: 'Zablokowane w ustawieniach telefonu/przeglądarki. Odblokuj powiadomienia dla tej strony w ustawieniach, a potem wróć tutaj.',
  'ios-install': 'Na iPhonie powiadomienia działają tylko w aplikacji dodanej do ekranu początkowego: Safari → Udostępnij → „Do ekranu początkowego”. Potem otwórz aplikację z ikonki i włącz je tutaj.',
  unsupported: 'Ta przeglądarka nie obsługuje powiadomień. Na Androidzie użyj Chrome, na iPhonie – aplikacji dodanej do ekranu początkowego (iOS 16.4 lub nowszy).',
  demo: 'Dostępne po połączeniu z bazą Supabase (nie w trybie demo).',
};

// Karta w zakładce Konto.
export async function pushSettingsCard(role) {
  const state = await pushState();
  const what = role === 'coach'
    ? 'np. gdy podopieczny zapisze trening albo zrobi rutynę.'
    : 'np. o nowym planie, ostatnim treningu w karnecie i wiadomościach od trenera.';
  return html`<section class="card push-card" data-push-state="${state}">
    <h2>${icons.bell} Powiadomienia</h2>
    <p class="small">Dymki na ekranie telefonu, ${what}</p>
    <p class="muted small">${STATE_TEXT[state]}</p>
    ${state === 'off' ? html`<button type="button" class="btn" data-push-enable>${icons.bell} Włącz powiadomienia</button>` : ''}
    ${state === 'on' ? html`<div class="row gap wrap">
      <button type="button" class="btn btn-outline" data-push-test>Wyślij próbne</button>
      <button type="button" class="btn btn-ghost" data-push-disable>Wyłącz</button></div>` : ''}
  </section>`;
}

// Mały baner na ekranie głównym, dopóki ktoś nie włączy albo nie zamknie.
export async function pushPrompt() {
  try {
    if (localStorage.getItem(DISMISS_KEY)) return '';
  } catch {
    // brak dostępu do pamięci – pokazujemy baner
  }
  const state = await pushState();
  if (state !== 'off' && state !== 'ios-install') return '';
  return html`<section class="card push-prompt">
    <span class="push-prompt-icon">${icons.bell}</span>
    <span class="grow small">${state === 'off'
      ? 'Włącz powiadomienia, żeby nic Cię nie ominęło.'
      : 'Dodaj aplikację do ekranu początkowego, a dostaniesz też powiadomienia.'}</span>
    ${state === 'off' ? html`<button type="button" class="btn btn-small" data-push-enable>Włącz</button>` : ''}
    <button type="button" class="icon-btn" data-push-dismiss aria-label="Zamknij">✕</button>
  </section>`;
}

// Obsługa przycisków z karty i banera; onChange odświeża widok.
export function bindPush(root, me, onChange) {
  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-push-enable], [data-push-disable], [data-push-test], [data-push-dismiss]');
    if (!button) return;
    const { dataset } = button;
    if ('pushDismiss' in dataset) {
      try {
        localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        // trudno – baner wróci przy następnym otwarciu
      }
      button.closest('.push-prompt')?.remove();
      return;
    }
    button.disabled = true;
    try {
      if ('pushEnable' in dataset) {
        await enablePush();
        toast('Powiadomienia włączone', 'success');
      } else if ('pushDisable' in dataset) {
        await disablePush();
        toast('Powiadomienia wyłączone', 'success');
      } else {
        await api.sendPush({ to: [me.id], title: 'Działa! 💪', body: 'Tak będą wyglądać powiadomienia z aplikacji.', url: '#/account' });
        toast('Wysłano – powiadomienie pojawi się za chwilę', 'success');
      }
      onChange();
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  });
}

// Formularz wiadomości od trenera (do jednej osoby albo do wszystkich podopiecznych).
export function messageForm(target) {
  return html`<form class="card stack message-form" id="message-form">
    <label>Wiadomość ${target ? html`do: <strong>${target}</strong>` : 'do wszystkich podopiecznych'}
      <textarea id="message-text" rows="3" maxlength="300" required placeholder="np. W piątek trening przesunięty na 18:00"></textarea></label>
    <button class="btn" type="submit">${icons.bell} Wyślij powiadomienie</button>
  </form>`;
}

export function bindMessageForm(to, senderName) {
  $('#message-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = $('#message-text').value.trim();
    if (!text) return;
    const button = event.submitter;
    button.disabled = true;
    try {
      const { sent } = await api.sendPush({ to, title: `Wiadomość od trenera ${senderName}`, body: text, url: '#/' });
      toast(sent ? `Wysłano powiadomienie (urządzenia: ${sent})` : 'Nikt z odbiorców nie włączył jeszcze powiadomień', sent ? 'success' : 'error');
      if (sent) $('#message-text').value = '';
    } catch (error) {
      toast(error.message, 'error');
    }
    button.disabled = false;
  });
}
