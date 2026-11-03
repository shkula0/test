// Karnety podopiecznych: ile treningów zostało, odbijanie treningów, przypomnienia i panel trenera.

import { api } from './data/index.js';
import { icons } from './icons.js';
import { notify } from './push.js';
import { $, html, toast, todayIso, formatDate, formatNumber, initials, toNumber } from './ui.js';

export const PASS_TYPES = [4, 8, 12];

function plural(n, one, few, many) {
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

const trainings = (n) => `${n} ${plural(n, 'trening', 'treningi', 'treningów')}`;

export function passStatus(pass) {
  const used = pass.uses?.length ?? 0;
  const left = pass.sessions - used;
  return { used, left, state: left > 0 ? 'active' : 'used', ending: left === 1 };
}

const byPurchase = (a, b) => a.pass.starts_on.localeCompare(b.pass.starts_on) || a.pass.created_at.localeCompare(b.pass.created_at);

// Karnet „bieżący”: najstarszy z wolnymi treningami (kolejny karnet czeka, aż ten się skończy),
// a gdy wszystkie są wykorzystane – ostatni. queued: ile karnetów czeka w kolejce.
export function currentPass(passes) {
  const rows = passes.map((pass) => ({ pass, status: passStatus(pass) })).sort(byPurchase);
  const open = rows.filter((r) => r.status.state === 'active');
  const current = open[0] ?? rows.at(-1);
  return current ? { ...current, queued: Math.max(open.length - 1, 0) } : null;
}

// Karnet nie zostanie odczytany, jeśli w bazie nie ma jeszcze tabel (migracja 010) – wtedy po prostu go nie pokazujemy.
export async function loadPasses(clientId) {
  try {
    return await api.listPasses(clientId);
  } catch {
    return null;
  }
}

function stateLine(current) {
  const queued = current.queued ? ` · czeka jeszcze ${current.queued === 1 ? 'kolejny karnet' : `${current.queued} karnety`}` : '';
  return `Od ${formatDate(current.pass.starts_on)}${queued}`;
}

function badges(pass, status) {
  const list = [];
  if (status.state === 'used') list.push(['danger', 'wykorzystany']);
  else if (status.ending) list.push(['warn', 'ostatni trening']);
  if (!pass.paid) list.push(['warn', pass.price ? `do zapłaty ${formatNumber(pass.price, 2)} zł` : 'nieopłacony']);
  return list.map(([tone, text]) => html`<span class="pass-badge ${tone}">${text}</span>`);
}

// Kropki: pełne = odbite treningi, puste = do wykorzystania.
function dots(pass, status) {
  const count = Math.max(pass.sessions, status.used);
  return html`<div class="pass-dots" aria-label="Wykorzystano ${status.used} z ${pass.sessions}">
    ${Array.from({ length: count }, (_, i) => html`<span class="${i < status.used ? (i < pass.sessions ? 'used' : 'over') : ''}"></span>`)}</div>`;
}

// Karta karnetu (podopieczny na stronie głównej, trener w karcie podopiecznego i w panelu).
export function passCard(current, { manageHref = '', compact = false } = {}) {
  if (!current) return '';
  const { pass, status } = current;
  const big = status.left >= 0 ? `Zostało ${status.left} z ${pass.sessions}` : `Ponad karnet: ${-status.left}`;
  return html`<section class="card pass-card ${status.state} ${status.ending ? 'ending' : ''}">
    <div class="row gap">
      <span class="pass-icon">${icons.ticket}</span>
      <div class="grow">
        <span class="muted small">Karnet · ${trainings(pass.sessions)}</span>
        <strong class="pass-big">${big}</strong>
      </div>
      ${manageHref ? html`<a class="btn btn-small btn-outline" href="#${manageHref}">Zarządzaj</a>` : ''}
    </div>
    ${dots(pass, status)}
    <p class="small pass-line">${stateLine(current)} ${badges(pass, status)}</p>
    ${!compact && pass.notes ? html`<p class="muted small">${pass.notes}</p>` : ''}
  </section>`;
}

// Komunikat po odbiciu: ostatni trening i koniec karnetu wyróżnione.
export function afterUseMessage(current) {
  const left = current.status.left - 1;
  if (left === 1) return 'Odbito trening – został OSTATNI trening w karnecie';
  if (left === 0) return current.queued ? 'Karnet wykorzystany – kolejny karnet rusza od następnego treningu' : 'Karnet wykorzystany – czas na nowy karnet';
  if (left < 0) return `Odbito ponad karnet (${-left})`;
  return `Odbito trening – zostało ${left} z ${current.pass.sessions}`;
}

// Powiadomienie dla podopiecznego, gdy po odbiciu został ostatni trening albo karnet się skończył.
export function notifyAfterUse(current) {
  const left = current.status.left - 1;
  if (left === 1) notify([current.pass.client_id], 'Został Ci ostatni trening w karnecie', 'Porozmawiaj z trenerem o kolejnym karnecie.');
  if (left === 0 && !current.queued) notify([current.pass.client_id], 'Karnet wykorzystany', 'Wszystkie treningi z karnetu zostały wykorzystane – czas na nowy karnet.');
}

// Odbicie treningu z karnetu; gdy karnet jest wykorzystany – najpierw pytamy.
async function usePass(current) {
  if (current.status.left <= 0 && !confirm('Wszystkie treningi z karnetu są już wykorzystane. Odbić ponad karnet?')) return false;
  await api.addPassUse(current.pass.id, todayIso());
  toast(afterUseMessage(current), current.status.left <= 2 ? 'error' : 'success');
  notifyAfterUse(current);
  return true;
}

// Przypomnienia dla trenera: ostatni trening, wykorzystany karnet, nowy karnet do opłacenia.
export function passAlerts(clients, passes) {
  const alerts = [];
  for (const client of clients) {
    const current = currentPass(passes.filter((p) => p.client_id === client.id));
    if (!current) continue;
    const { pass, status } = current;
    if (status.ending) alerts.push({ client, pass, kind: 'last', text: 'został ostatni trening w karnecie' });
    if (status.state === 'used') alerts.push({ client, pass, kind: 'used', text: 'karnet wykorzystany – czas na nowy' });
    if (!pass.paid) {
      const amount = pass.price ? ` ${formatNumber(pass.price, 2)} zł` : '';
      alerts.push({ client, pass, kind: 'pay', text: `nowy karnet (${trainings(pass.sessions)}) – przypomnij o wpłacie${amount}` });
    }
  }
  return alerts;
}

const ALERT_ICON = { last: '⚠️', used: '⛔', pay: '💰' };

// Lista przypomnień; przy wpłacie przycisk „Opłacony”. Zwraca '' gdy nie ma czego pokazać.
export function passAlertsHtml(alerts) {
  if (!alerts.length) return '';
  return html`<section class="card pass-alerts">
    <h2 class="small-head">${icons.ticket} Karnety – przypomnienia</h2>
    <ul class="list">${alerts.map((a) => html`<li class="pass-alert ${a.kind}">
      <span aria-hidden="true">${ALERT_ICON[a.kind]}</span>
      <a class="grow" href="#/passes/${a.client.id}"><strong>${a.client.full_name}</strong> – ${a.text}</a>
      ${a.kind === 'pay' ? html`<button type="button" class="btn btn-small btn-outline" data-mark-paid="${a.pass.id}">Opłacony</button>` : ''}
      ${a.kind === 'used' ? html`<a class="btn btn-small" href="#/passes/${a.client.id}/new">Nowy</a>` : ''}
    </li>`)}</ul>
  </section>`;
}

// Obsługa przycisku „Opłacony” w przypomnieniach; po zapisie odświeża widok.
export function bindPassAlerts(root, passes, refresh) {
  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-mark-paid]');
    if (!button) return;
    const pass = passes.find((p) => p.id === button.dataset.markPaid);
    button.disabled = true;
    try {
      await api.savePass({ ...pass, paid: true });
      toast('Karnet opłacony', 'success');
      refresh();
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  });
}

// ============================================================
// Panel trenera: wszyscy podopieczni i ich karnety
// ============================================================

const URGENCY = { none: 0, used: 1, ending: 2, unpaid: 3, active: 4 };

export async function viewPasses(ctx) {
  const [clients, passes] = await Promise.all([api.listClients(), loadPasses()]);
  if (!passes) {
    return ctx.renderShell({
      title: 'Karnety', nav: 'passes',
      body: html`<section class="card"><p>Karnety wymagają aktualizacji bazy danych.</p>
        <p class="muted small">W Supabase otwórz SQL Editor → New query, wklej plik <strong>010_karnety.sql</strong> i kliknij Run.</p></section>`,
    });
  }
  const rows = clients.map((client) => {
    const current = currentPass(passes.filter((p) => p.client_id === client.id));
    const s = current?.status;
    const key = !current ? 'none' : s.state === 'used' ? 'used' : s.ending ? 'ending' : !current.pass.paid ? 'unpaid' : 'active';
    return { client, current, key };
  }).sort((a, b) => URGENCY[a.key] - URGENCY[b.key] || a.client.full_name.localeCompare(b.client.full_name, 'pl'));

  const active = rows.filter((r) => r.current?.status.state === 'active').length;
  const attention = rows.filter((r) => ['none', 'used', 'ending'].includes(r.key)).length;
  const alerts = passAlerts(clients, passes);
  const unpaid = passes.filter((p) => !p.paid && p.client_id !== ctx.me.id);
  const unpaidSum = unpaid.reduce((sum, p) => sum + (Number(p.price) || 0), 0);

  ctx.renderShell({
    title: 'Karnety',
    nav: 'passes',
    body: html`
      <section class="card pass-stats">
        <div><span class="stat">${active}</span><span class="muted small">aktywne</span></div>
        <div><span class="stat ${attention ? 'warn' : ''}">${attention}</span><span class="muted small">do przedłużenia</span></div>
        <div><span class="stat ${unpaid.length ? 'warn' : ''}">${unpaid.length}</span><span class="muted small">do zapłaty${unpaidSum ? html`<br>${formatNumber(unpaidSum, 0)} zł` : ''}</span></div>
      </section>
      ${passAlertsHtml(alerts)}
      ${rows.length ? html`<div class="stack">${rows.map(({ client, current }) => html`
        <section class="card pass-row" data-client="${client.id}">
          <a class="row gap pass-row-head" href="#/passes/${client.id}">
            <span class="avatar">${initials(client.full_name)}</span>
            <span class="grow"><strong>${client.full_name}</strong><br>
              <span class="small ${current ? '' : 'muted'}">${current ? `Zostało ${current.status.left} z ${current.pass.sessions}` : 'Brak karnetu'}</span></span>
            ${icons.chevron}
          </a>
          ${current ? html`${dots(current.pass, current.status)}
            <p class="small pass-line">${stateLine(current)} ${badges(current.pass, current.status)}</p>` : ''}
          <div class="row gap wrap">
            ${current ? html`<button type="button" class="btn btn-small" data-use>${icons.check} Odbij trening</button>` : ''}
            <a class="btn btn-small btn-outline" href="#/passes/${client.id}/new">${icons.plus} ${current ? 'Nowy / przedłuż' : 'Dodaj karnet'}</a>
          </div>
        </section>`)}</div>`
        : ctx.emptyState('Nie masz jeszcze podopiecznych. Zaproś ich w zakładce Podopieczni.')}`,
  });

  bindPassAlerts($('.content'), passes, () => viewPasses(ctx));
  $('.content').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-use]');
    if (!button) return;
    const row = rows.find((r) => r.client.id === button.closest('[data-client]').dataset.client);
    button.disabled = true;
    try {
      if (await usePass(row.current)) return viewPasses(ctx);
    } catch (error) {
      toast(error.message, 'error');
    }
    button.disabled = false;
  });
}

// ============================================================
// Karnety jednego podopiecznego: bieżący, odbite treningi, historia
// ============================================================

export async function viewClientPasses(ctx, clientId) {
  const [client, passes] = await Promise.all([api.getProfile(clientId), loadPasses(clientId)]);
  if (!client || (client.coach_id !== ctx.me.id && client.id !== ctx.me.id)) return ctx.viewNotFound();
  if (!passes) return ctx.go('/passes');
  const current = currentPass(passes);
  const others = passes.filter((p) => p.id !== current?.pass.id);

  const usesList = (pass) => {
    const uses = [...pass.uses].sort((a, b) => b.used_on.localeCompare(a.used_on) || b.created_at.localeCompare(a.created_at));
    if (!uses.length) return html`<p class="muted small">Jeszcze nic nie odbito.</p>`;
    return html`<ul class="list pass-uses">${uses.map((u, i) => html`<li>
      <span class="grow">${uses.length - i}. ${formatDate(u.used_on)}
        ${u.workout_id ? html`<a class="small" href="#/workout/${u.workout_id}">trening</a>` : html`<span class="muted small">ręcznie</span>`}</span>
      <button type="button" class="icon-btn danger" data-remove-use="${u.id}" aria-label="Cofnij odbicie z ${formatDate(u.used_on)}">${icons.trash}</button>
    </li>`)}</ul>`;
  };

  ctx.renderShell({
    title: `Karnet · ${client.full_name}`,
    back: '/passes',
    nav: 'passes',
    body: html`
      ${current ? html`
        ${passCard(current)}
        <div class="row gap wrap">
          <button type="button" class="btn grow" id="use-pass">${icons.check} Odbij trening</button>
          <a class="btn btn-outline" href="#/passes/${clientId}/edit?id=${current.pass.id}">${icons.edit} Edytuj</a>
        </div>
        ${!current.pass.paid ? html`<button type="button" class="btn btn-outline btn-block" id="mark-paid">${icons.check} Oznacz jako opłacony</button>` : ''}
        <section class="card"><h2 class="small-head">Odbite treningi</h2>${usesList(current.pass)}</section>`
        : ctx.emptyState('Ten podopieczny nie ma jeszcze karnetu.')}
      <a class="btn btn-block ${current ? 'btn-outline' : ''}" href="#/passes/${clientId}/new">${icons.plus} ${current ? 'Nowy karnet / przedłużenie' : 'Dodaj karnet'}</a>
      ${others.length ? html`<h2>Pozostałe karnety</h2>
        <ul class="list card">${others.map((p) => {
          const s = passStatus(p);
          return html`<li><a class="list-item" href="#/passes/${clientId}/edit?id=${p.id}">
            <span class="grow"><strong>${trainings(p.sessions)}</strong> · od ${formatDate(p.starts_on)}${s.state === 'active' && !s.used ? ' · czeka w kolejce' : ''}<br>
              <span class="muted small">Wykorzystano ${s.used} z ${p.sessions}${p.paid ? '' : ' · nieopłacony'}</span></span>
            ${icons.chevron}</a></li>`;
        })}</ul>` : ''}`,
  });

  $('#use-pass')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      await usePass(current);
    } catch (error) {
      toast(error.message, 'error');
    }
    viewClientPasses(ctx, clientId);
  });
  $('#mark-paid')?.addEventListener('click', async () => {
    try {
      await api.savePass({ ...current.pass, paid: true });
      toast('Karnet opłacony', 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
    viewClientPasses(ctx, clientId);
  });
  $('.content').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-remove-use]');
    if (!button || !confirm('Cofnąć to odbicie? Trening wróci do puli karnetu.')) return;
    try {
      await api.deletePassUse(button.dataset.removeUse);
    } catch (error) {
      toast(error.message, 'error');
    }
    viewClientPasses(ctx, clientId);
  });
}

// ============================================================
// Nowy karnet / edycja
// ============================================================

export async function viewPassEditor(ctx, clientId, passId) {
  const [client, passes] = await Promise.all([api.getProfile(clientId), loadPasses(clientId)]);
  if (!client || (client.coach_id !== ctx.me.id && client.id !== ctx.me.id) || !passes) return ctx.viewNotFound();
  const existing = passId ? passes.find((p) => p.id === passId) : null;
  if (passId && !existing) return ctx.viewNotFound();

  // Nowy karnet domyślnie tego samego rodzaju co bieżący; jeśli bieżący ma jeszcze treningi, nowy czeka w kolejce.
  const current = currentPass(passes);
  let sessions = existing?.sessions ?? current?.pass.sessions ?? 8;
  const lastPriceFor = (n) => passes.find((p) => p.sessions === n && p.price != null)?.price ?? '';

  ctx.renderShell({
    title: existing ? 'Edytuj karnet' : 'Nowy karnet',
    back: `/passes/${clientId}`,
    nav: 'passes',
    body: html`
      <p class="muted">Dla: <strong>${client.full_name}</strong></p>
      <form id="pass-form" class="stack" autocomplete="off">
        <section class="card stack">
          <span class="field-label">Rodzaj karnetu</span>
          <div class="row gap wrap" id="pass-types">
            ${PASS_TYPES.map((n) => html`<button type="button" class="chip ${n === sessions ? 'active' : ''}" data-sessions="${n}">${trainings(n)}</button>`)}
            <button type="button" class="chip ${PASS_TYPES.includes(sessions) ? '' : 'active'}" data-sessions="custom">Inny</button>
          </div>
          <label ${PASS_TYPES.includes(sessions) ? 'hidden' : ''} id="custom-wrap">Liczba treningów
            <input id="pass-sessions" type="number" min="1" max="100" inputmode="numeric" value="${sessions}"></label>
          ${existing ? '' : html`<label>Wykorzystane już treningi
            <input id="pass-used" type="number" min="0" max="100" inputmode="numeric" value="0"></label>
          <p class="muted small">Gdy ktoś jest w trakcie karnetu kupionego wcześniej, wpisz, ile treningów już zrobił.</p>
          ${current?.status.state === 'active' ? html`<p class="small pass-queue-note">Obecny karnet ma jeszcze ${trainings(current.status.left)} –
            nowy zacznie się liczyć, gdy tamten się skończy.</p>` : ''}`}
        </section>
        <section class="card stack">
          <div class="row gap">
            <label class="grow">Cena (zł)<input id="pass-price" inputmode="decimal" value="${existing?.price != null ? String(existing.price).replace('.', ',') : String(lastPriceFor(sessions)).replace('.', ',')}" placeholder="np. 600"></label>
            <label class="chip chip-check pass-paid ${existing?.paid ? 'active' : ''}"><input type="checkbox" id="pass-paid" ${existing?.paid ? 'checked' : ''}> Opłacony</label>
          </div>
          <label>Notatka<input id="pass-notes" value="${existing?.notes ?? ''}" placeholder="np. płatność przelewem"></label>
        </section>
        ${existing ? html`<button type="button" class="btn btn-outline danger btn-block" id="delete-pass">${icons.trash} Usuń karnet</button>` : ''}
        <div class="sticky-actions"><button class="btn btn-block" type="submit">${icons.check} Zapisz karnet</button></div>
      </form>`,
  });

  const priceInput = $('#pass-price');
  let priceTouched = Boolean(existing);
  priceInput.addEventListener('input', () => { priceTouched = true; });
  $('#pass-types').addEventListener('click', (event) => {
    const button = event.target.closest('[data-sessions]');
    if (!button) return;
    const custom = button.dataset.sessions === 'custom';
    $('#custom-wrap').hidden = !custom;
    if (!custom) {
      sessions = Number(button.dataset.sessions);
      $('#pass-sessions').value = sessions;
      if (!priceTouched) priceInput.value = String(lastPriceFor(sessions)).replace('.', ',');
    } else {
      $('#pass-sessions').focus();
    }
    for (const chip of $('#pass-types').children) chip.classList.toggle('active', chip === button);
  });
  $('#pass-paid').addEventListener('change', (event) => event.target.closest('label').classList.toggle('active', event.target.checked));

  $('#delete-pass')?.addEventListener('click', async () => {
    if (!confirm('Usunąć ten karnet razem z odbitymi treningami?')) return;
    try {
      await api.deletePass(existing.id);
      toast('Karnet usunięty', 'success');
      ctx.go(`/passes/${clientId}`);
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#pass-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const count = Number($('#pass-sessions').value);
    const startsOn = existing?.starts_on ?? todayIso();
    const priceText = priceInput.value.trim();
    const price = priceText ? toNumber(priceText) : null;
    if (!Number.isInteger(count) || count < 1 || count > 100) return toast('Podaj liczbę treningów (1–100).', 'error');
    if (priceText && (price == null || price < 0)) return toast('Niepoprawna cena.', 'error');
    const alreadyUsed = Number($('#pass-used')?.value || 0);
    if (!Number.isInteger(alreadyUsed) || alreadyUsed < 0 || alreadyUsed > count) {
      return toast(`Wykorzystane treningi: od 0 do ${count}.`, 'error');
    }
    const button = event.submitter ?? $('#pass-form [type=submit]');
    button.disabled = true;
    try {
      const id = await api.savePass({
        id: existing?.id, client_id: clientId, sessions: count, starts_on: startsOn, ends_on: null,
        price, paid: $('#pass-paid').checked, notes: $('#pass-notes').value.trim(),
      });
      // Treningi zrobione przed założeniem karnetu w aplikacji.
      for (let i = 0; i < alreadyUsed; i += 1) await api.addPassUse(id, startsOn);
      if (!existing && clientId !== ctx.me.id) {
        const amount = price ? ` ${formatNumber(price, 2)} zł` : '';
        notify([clientId], `Nowy karnet: ${trainings(count)}`,
          $('#pass-paid').checked ? 'Miłych treningów! 💪' : `Pamiętaj o wpłacie${amount} za karnet.`);
      }
      toast('Karnet zapisany', 'success');
      ctx.go(`/passes/${clientId}`);
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  });
}
