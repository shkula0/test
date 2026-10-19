import { api } from './data/index.js';
import { lineChart } from './chart.js';
import { icons } from './icons.js';
import {
  $, $$, html, raw, toast, todayIso, formatDate, formatNumber, initials,
  estimatedOneRepMax, formData, toNumber,
} from './ui.js';

const app = document.getElementById('app');
let me = null;
let installPrompt = null;

const COMMON_EXERCISES = [
  'Przysiad ze sztangą', 'Martwy ciąg', 'Martwy ciąg rumuński', 'Wyciskanie sztangi leżąc',
  'Wyciskanie żołnierskie', 'Wiosłowanie sztangą', 'Podciąganie', 'Hip thrust', 'Pompki na poręczach',
];

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener('hashchange', router);
router();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ============================================================
// Routing
// ============================================================

function go(path) {
  if (location.hash === `#${path}`) router();
  else location.hash = path;
}

async function router() {
  const hash = location.hash.slice(1) || '/';
  const [path, query = ''] = hash.split('?');
  const [section, id, action] = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);

  try {
    me = await api.currentUser();
    if (!me) {
      return section === 'register' ? viewRegister(params.get('kod') ?? '') : viewLogin();
    }

    const isCoach = me.role === 'coach';
    if (!section) return isCoach ? viewClients() : viewMyPlans();
    if (section === 'client' && id && isCoach) return viewClient(id, params.get('tab') ?? 'plans');
    if (section === 'plan' && id === 'new' && action && isCoach) return viewPlanEditor(null, action);
    if (section === 'plan' && id && action === 'edit' && isCoach) return viewPlanEditor(id);
    if (section === 'plan' && id) return viewPlan(id);
    if (section === 'progress' && !isCoach) return viewMyProgress();
    if (section === 'account') return viewAccount();
    if (section === 'login' || section === 'register') return go('/');
    return viewNotFound();
  } catch (error) {
    console.error(error);
    renderShell({
      title: 'Błąd',
      body: html`<div class="card"><p>${error.message}</p>
        <button class="btn" id="retry">Spróbuj ponownie</button></div>`,
    });
    $('#retry').addEventListener('click', router);
  }
}

// ============================================================
// Szkielet ekranu
// ============================================================

function renderShell({ title, back, body, nav }) {
  app.innerHTML = html`
    <header class="topbar">
      ${back
        ? html`<a class="icon-btn" href="#${back}" aria-label="Wstecz">${icons.back}</a>`
        : html`<span class="topbar-logo">${icons.logo}</span>`}
      <h1>${title}</h1>
      ${api.mode === 'demo' ? html`<span class="badge" title="Dane zapisywane tylko w tej przeglądarce">DEMO</span>` : ''}
    </header>
    <main class="content">${body}</main>
    ${me ? navBar(nav) : ''}
  `;
  window.scrollTo(0, 0);
}

function navBar(active) {
  const items = me.role === 'coach'
    ? [['clients', '/', 'Podopieczni', icons.users], ['account', '/account', 'Konto', icons.user]]
    : [['plans', '/', 'Plany', icons.list], ['progress', '/progress', 'Postępy', icons.chart], ['account', '/account', 'Konto', icons.user]];
  return html`<nav class="tabbar">
    ${items.map(([key, href, label, icon]) => html`
      <a href="#${href}" class="${key === active ? 'active' : ''}" ${key === active ? html`aria-current="page"` : ''}>
        ${icon}<span>${label}</span>
      </a>`)}
  </nav>`;
}

function emptyState(text) {
  return html`<div class="empty">${icons.logo}<p>${text}</p></div>`;
}

function viewNotFound() {
  renderShell({ title: 'Nie znaleziono', back: '/', body: emptyState('Ta strona nie istnieje albo nie masz do niej dostępu.') });
}

// ============================================================
// Logowanie i rejestracja
// ============================================================

function viewLogin() {
  const demo = api.mode === 'demo';
  app.innerHTML = html`
    <main class="auth">
      <div class="auth-logo">${icons.logo}</div>
      <h1>Trener</h1>
      <p class="muted">Plany treningowe i postępy w jednym miejscu.</p>

      ${demo ? html`
        <section class="card">
          <h2>Tryb demo</h2>
          <p class="muted small">Wybierz konto, aby zobaczyć aplikację. Dane są zapisywane tylko w tej przeglądarce.</p>
          <div class="stack">
            ${api.demoAccounts().map((acc) => html`
              <button class="btn btn-outline demo-login" data-email="${acc.email}">
                ${acc.full_name} <span class="muted small">· ${acc.role === 'coach' ? 'trener' : 'podopieczny'}</span>
              </button>`)}
          </div>
        </section>` : ''}

      <form class="card stack" id="login-form">
        <h2>Zaloguj się</h2>
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
        <label>Hasło<input type="password" name="password" autocomplete="current-password" ${demo ? '' : 'required'}></label>
        <button class="btn" type="submit">Zaloguj</button>
      </form>
      <p class="center">Nie masz konta? <a href="#/register">Zarejestruj się</a></p>
    </main>`;

  $$('.demo-login').forEach((btn) => btn.addEventListener('click', async () => {
    await api.signIn(btn.dataset.email, '');
    go('/');
  }));

  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const { email, password } = formData(event.target);
    await submitting(event.target, async () => {
      await api.signIn(email, password);
      go('/');
    });
  });
}

function viewRegister(code) {
  app.innerHTML = html`
    <main class="auth">
      <div class="auth-logo">${icons.logo}</div>
      <h1>Załóż konto</h1>
      <form class="card stack" id="register-form">
        <fieldset class="segmented">
          <legend class="sr-only">Rodzaj konta</legend>
          <label><input type="radio" name="role" value="client" checked><span>Podopieczny</span></label>
          <label><input type="radio" name="role" value="coach"><span>Trener</span></label>
        </fieldset>
        <label>Imię i nazwisko<input name="fullName" autocomplete="name" required></label>
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
        <label>Hasło<input type="password" name="password" autocomplete="new-password" minlength="6" required></label>
        <label id="code-field">Kod trenera
          <input name="coachCode" value="${code}" autocapitalize="characters" placeholder="np. AB12CD" required>
          <span class="hint" id="coach-name"></span>
        </label>
        <button class="btn" type="submit">Utwórz konto</button>
      </form>
      <p class="center">Masz już konto? <a href="#/login">Zaloguj się</a></p>
    </main>`;

  const form = $('#register-form');
  const codeField = $('#code-field');
  const codeInput = form.elements.coachCode;
  const coachName = $('#coach-name');

  const syncRole = () => {
    const isClient = form.elements.role.value === 'client';
    codeField.hidden = !isClient;
    codeInput.required = isClient;
  };
  form.addEventListener('change', syncRole);
  syncRole();

  let lookup = 0;
  const checkCode = async () => {
    const value = codeInput.value.trim();
    const current = ++lookup;
    if (value.length < 4) {
      coachName.textContent = '';
      return;
    }
    const name = await api.coachNameForCode(value).catch(() => null);
    if (current !== lookup) return;
    coachName.textContent = name ? `Trener: ${name}` : 'Nie znaleziono trenera z tym kodem';
    coachName.classList.toggle('error', !name);
  };
  codeInput.addEventListener('input', checkCode);
  checkCode();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formData(form);
    await submitting(form, async () => {
      const { needsConfirmation } = await api.signUp({
        ...data,
        coachCode: data.role === 'client' ? data.coachCode : '',
      });
      if (needsConfirmation) {
        app.innerHTML = html`<main class="auth"><div class="auth-logo">${icons.logo}</div>
          <h1>Sprawdź pocztę</h1>
          <p>Wysłaliśmy link potwierdzający na <strong>${data.email}</strong>. Po kliknięciu w link zaloguj się.</p>
          <a class="btn" href="#/login">Przejdź do logowania</a></main>`;
      } else {
        go('/');
      }
    });
  });
}

// Blokuje przycisk na czas wysyłki formularza i pokazuje błąd w toaście.
async function submitting(form, action) {
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

// ============================================================
// Widoki trenera
// ============================================================

async function viewClients() {
  const clients = await api.listClients();
  renderShell({
    title: 'Podopieczni',
    nav: 'clients',
    body: html`
      ${inviteCard()}
      ${clients.length
        ? html`<ul class="list card">${clients.map((c) => html`
            <li><a href="#/client/${c.id}" class="list-item">
              <span class="avatar">${initials(c.full_name)}</span>
              <span class="grow">${c.full_name}</span>${icons.chevron}
            </a></li>`)}</ul>`
        : emptyState('Nie masz jeszcze podopiecznych. Wyślij im link z zaproszeniem – po rejestracji pojawią się tutaj.')}
    `,
  });
  bindInvite();
}

function inviteCard() {
  return html`<section class="card invite">
    <div>
      <p class="muted small">Twój kod zaproszenia</p>
      <p class="code">${me.invite_code}</p>
    </div>
    <button class="btn" id="share-invite">${icons.share} Zaproś</button>
  </section>`;
}

function bindInvite() {
  $('#share-invite')?.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#/register?kod=${me.invite_code}`;
    const text = `Dołącz do mnie w aplikacji treningowej. Mój kod trenera: ${me.invite_code}`;
    if (navigator.share) {
      await navigator.share({ title: 'Zaproszenie', text, url }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(`${text}\n${url}`);
      toast('Skopiowano link zaproszenia');
    }
  });
}

async function viewClient(clientId, tab) {
  const client = await api.getProfile(clientId);
  if (!client || client.coach_id !== me.id) return viewNotFound();

  const tabLink = (key, label) => html`<a href="#/client/${clientId}?tab=${key}" class="${tab === key ? 'active' : ''}">${label}</a>`;
  renderShell({
    title: client.full_name,
    back: '/',
    nav: 'clients',
    body: html`
      <div class="tabs">${tabLink('plans', 'Plany')}${tabLink('progress', 'Postępy')}</div>
      <div id="tab-content"></div>`,
  });

  const container = $('#tab-content');
  if (tab === 'progress') {
    await mountProgress(container, clientId);
  } else {
    const plans = await api.listPlans(clientId);
    container.innerHTML = html`
      <a class="btn btn-block" href="#/plan/new/${clientId}">${icons.plus} Nowy plan</a>
      ${plans.length ? planList(plans) : emptyState('Ten podopieczny nie ma jeszcze planu treningowego.')}`;
  }
}

function planList(plans) {
  return html`<ul class="list card">${plans.map((p) => html`
    <li><a href="#/plan/${p.id}" class="list-item">
      <span class="grow"><strong>${p.name}</strong><br>
        <span class="muted small">Zaktualizowano ${formatDate(p.updated_at)}</span></span>
      ${icons.chevron}
    </a></li>`)}</ul>`;
}

async function viewPlanEditor(planId, newClientId) {
  const existing = planId ? await api.getPlan(planId) : null;
  if (planId && !existing) return viewNotFound();

  const clientId = existing?.plan.client_id ?? newClientId;
  const client = await api.getProfile(clientId);
  if (!client || client.coach_id !== me.id) return viewNotFound();

  const blank = (day = 'Dzień A') => ({ day, name: '', sets: '', reps: '', weight: '', rest: '', notes: '' });
  const rows = existing?.exercises.map(({ day, name, sets, reps, weight, rest, notes }) => ({ day, name, sets, reps, weight, rest, notes }))
    ?? [blank()];

  renderShell({
    title: existing ? 'Edytuj plan' : 'Nowy plan',
    back: existing ? `/plan/${planId}` : `/client/${clientId}`,
    nav: 'clients',
    body: html`
      <p class="muted">Dla: <strong>${client.full_name}</strong></p>
      <form id="plan-form" class="stack">
        <section class="card stack">
          <label>Nazwa planu<input name="planName" value="${existing?.plan.name ?? ''}" placeholder="np. FBW – 3× w tygodniu" required></label>
          <label>Uwagi dla podopiecznego<textarea name="planNotes" rows="3" placeholder="Rozgrzewka, wskazówki, częstotliwość…">${existing?.plan.notes ?? ''}</textarea></label>
        </section>
        <h2>Ćwiczenia</h2>
        <div id="rows" class="stack"></div>
        <button type="button" class="btn btn-outline btn-block" id="add-row">${icons.plus} Dodaj ćwiczenie</button>
        <div class="sticky-actions"><button class="btn btn-block" type="submit">Zapisz plan</button></div>
      </form>`,
  });

  const rowsEl = $('#rows');
  const drawRows = () => {
    rowsEl.innerHTML = html`${rows.map((r, i) => html`
      <fieldset class="card exercise-edit" data-index="${i}">
        <div class="row">
          <input class="day-input" name="day" value="${r.day}" placeholder="Dzień" aria-label="Dzień">
          <span class="grow"></span>
          <button type="button" class="icon-btn" data-move="-1" aria-label="Przesuń w górę" ${i === 0 ? 'disabled' : ''}>${icons.up}</button>
          <button type="button" class="icon-btn" data-move="1" aria-label="Przesuń w dół" ${i === rows.length - 1 ? 'disabled' : ''}>${icons.down}</button>
          <button type="button" class="icon-btn danger" data-remove aria-label="Usuń ćwiczenie">${icons.trash}</button>
        </div>
        <label>Ćwiczenie<input name="name" value="${r.name}" list="exercise-names" required></label>
        <div class="grid-4">
          <label>Serie<input name="sets" value="${r.sets}" inputmode="numeric"></label>
          <label>Powt.<input name="reps" value="${r.reps}"></label>
          <label>Ciężar<input name="weight" value="${r.weight}"></label>
          <label>Przerwa<input name="rest" value="${r.rest}"></label>
        </div>
        <label>Wskazówki<input name="notes" value="${r.notes}" placeholder="np. tempo, technika"></label>
      </fieldset>`)}
      <datalist id="exercise-names">${COMMON_EXERCISES.map((n) => html`<option value="${n}">`)}</datalist>`;
  };
  drawRows();

  rowsEl.addEventListener('input', (event) => {
    const fieldset = event.target.closest('[data-index]');
    rows[fieldset.dataset.index][event.target.name] = event.target.value;
  });
  rowsEl.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const i = Number(button.closest('[data-index]').dataset.index);
    if (button.dataset.move) {
      const j = i + Number(button.dataset.move);
      [rows[i], rows[j]] = [rows[j], rows[i]];
    } else if ('remove' in button.dataset) {
      rows.splice(i, 1);
    }
    drawRows();
  });
  $('#add-row').addEventListener('click', () => {
    rows.push(blank(rows.at(-1)?.day ?? 'Dzień A'));
    drawRows();
    $$('[name=name]', rowsEl).at(-1).focus();
  });

  $('#plan-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const { planName, planNotes } = formData(event.target);
    const exercises = rows
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.trim()])))
      .filter((r) => r.name);
    await submitting(event.target, async () => {
      const id = await api.savePlan({ id: planId, client_id: clientId, name: planName.trim(), notes: planNotes.trim() }, exercises);
      toast('Plan zapisany', 'success');
      go(`/plan/${id}`);
    });
  });
}

// ============================================================
// Plan treningowy (trener i podopieczny)
// ============================================================

async function viewPlan(planId) {
  const data = await api.getPlan(planId);
  if (!data) return viewNotFound();
  const { plan, exercises } = data;
  const isCoach = me.role === 'coach';

  const days = [];
  for (const ex of exercises) {
    const day = ex.day || 'Ćwiczenia';
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1).items.push(ex);
  }

  const details = (ex) => [
    ex.sets && ex.reps ? `${ex.sets} × ${ex.reps}` : ex.sets ? `${ex.sets} serie` : ex.reps ? `${ex.reps} powt.` : '',
    ex.weight,
    ex.rest && `przerwa ${ex.rest}`,
  ].filter(Boolean).join(' · ');

  renderShell({
    title: plan.name,
    back: isCoach ? `/client/${plan.client_id}` : '/',
    nav: isCoach ? 'clients' : 'plans',
    body: html`
      ${plan.notes ? html`<section class="card note">${plan.notes}</section>` : ''}
      ${days.length ? days.map(({ day, items }) => html`
        <section class="day">
          <h2>${day}</h2>
          <ol class="card exercises">${items.map((ex) => html`
            <li>
              <strong>${ex.name}</strong>
              ${details(ex) ? html`<span class="ex-details">${details(ex)}</span>` : ''}
              ${ex.notes ? html`<span class="muted small">${ex.notes}</span>` : ''}
            </li>`)}
          </ol>
        </section>`) : emptyState('Ten plan nie ma jeszcze ćwiczeń.')}
      <p class="muted small center">Ostatnia zmiana: ${formatDate(plan.updated_at)}</p>
      ${isCoach ? html`<div class="row gap">
        <a class="btn grow" href="#/plan/${plan.id}/edit">${icons.edit} Edytuj</a>
        <button class="btn btn-outline danger" id="delete-plan">${icons.trash} Usuń</button>
      </div>` : ''}`,
  });

  $('#delete-plan')?.addEventListener('click', async () => {
    if (!confirm(`Usunąć plan „${plan.name}”?`)) return;
    await api.deletePlan(plan.id);
    toast('Plan usunięty');
    go(`/client/${plan.client_id}`);
  });
}

// ============================================================
// Widoki podopiecznego
// ============================================================

async function viewMyPlans() {
  const [plans, coach] = await Promise.all([
    api.listPlans(me.id),
    me.coach_id ? api.getProfile(me.coach_id) : null,
  ]);
  renderShell({
    title: 'Moje plany',
    nav: 'plans',
    body: html`
      <p class="muted">Cześć, ${me.full_name.split(' ')[0]}!${coach ? html` Twój trener: <strong>${coach.full_name}</strong>.` : ''}</p>
      ${plans.length ? planList(plans) : emptyState('Trener nie przygotował jeszcze dla Ciebie planu. Zajrzyj tu wkrótce!')}`,
  });
}

async function viewMyProgress() {
  renderShell({ title: 'Postępy', nav: 'progress', body: html`<div id="progress"></div>` });
  await mountProgress($('#progress'), me.id);
}

// ============================================================
// Postępy: pomiary ciała i wyniki w ćwiczeniach
// ============================================================

const METRICS = {
  weight: { label: 'Waga', unit: 'kg' },
  waist: { label: 'Talia', unit: 'cm' },
  body_fat: { label: 'Tłuszcz', unit: '%' },
};

async function mountProgress(container, clientId) {
  const state = { metric: 'weight', exercise: null };

  async function draw() {
    const [metrics, lifts] = await Promise.all([api.listMetrics(clientId), api.listLifts(clientId)]);
    const exerciseNames = [...new Set(lifts.map((l) => l.exercise))].sort((a, b) => a.localeCompare(b, 'pl'));
    if (!exerciseNames.includes(state.exercise)) state.exercise = exerciseNames[0] ?? null;

    const metric = METRICS[state.metric];
    const metricPoints = metrics
      .filter((m) => m[state.metric] != null)
      .map((m) => ({ date: m.measured_on, value: Number(m[state.metric]) }));
    const latest = metricPoints.at(-1);
    const change = latest && metricPoints.length > 1 ? latest.value - metricPoints[0].value : null;

    const exerciseLifts = lifts.filter((l) => l.exercise === state.exercise);
    const liftPoints = bestPerDay(exerciseLifts);
    const best = exerciseLifts.reduce((top, l) => (!top || estimatedOneRepMax(l.weight, l.reps) > estimatedOneRepMax(top.weight, top.reps) ? l : top), null);

    const history = [
      ...metrics.map((m) => ({ kind: 'metric', id: m.id, date: m.measured_on, created: m.created_at,
        text: Object.entries(METRICS).filter(([k]) => m[k] != null).map(([k, def]) => `${def.label} ${formatNumber(m[k])} ${def.unit}`).join(' · '),
        note: m.note })),
      ...lifts.map((l) => ({ kind: 'lift', id: l.id, date: l.performed_on, created: l.created_at,
        text: `${l.exercise}: ${formatNumber(l.weight, 2)} kg × ${l.reps}`, note: l.note })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));

    container.innerHTML = html`
      <section class="card">
        <div class="card-head">
          <h2>Pomiary ciała</h2>
          <div class="chips">${Object.entries(METRICS).map(([key, def]) => html`
            <button class="chip ${key === state.metric ? 'active' : ''}" data-metric="${key}">${def.label}</button>`)}
          </div>
        </div>
        ${latest ? html`<p class="stat">${formatNumber(latest.value)} <small>${metric.unit}</small>
          ${change != null ? html`<span class="delta ${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${change > 0 ? '+' : ''}${formatNumber(change)} ${metric.unit} od początku</span>` : ''}
        </p>` : ''}
        ${htmlChart(metricPoints, metric.unit)}
        <details>
          <summary>${icons.plus} Dodaj pomiar</summary>
          <form id="metric-form" class="stack">
            <label>Data<input type="date" name="measured_on" value="${todayIso()}" required></label>
            <div class="grid-3">
              <label>Waga (kg)<input name="weight" inputmode="decimal"></label>
              <label>Talia (cm)<input name="waist" inputmode="decimal"></label>
              <label>Tłuszcz (%)<input name="body_fat" inputmode="decimal"></label>
            </div>
            <label>Notatka<input name="note"></label>
            <button class="btn" type="submit">Zapisz pomiar</button>
          </form>
        </details>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Wyniki w ćwiczeniach</h2>
          ${exerciseNames.length ? html`<select id="exercise-select" aria-label="Ćwiczenie">
            ${exerciseNames.map((n) => html`<option ${n === state.exercise ? 'selected' : ''}>${n}</option>`)}
          </select>` : ''}
        </div>
        ${best ? html`<p class="stat">${formatNumber(estimatedOneRepMax(best.weight, best.reps))} <small>kg szac. 1RM</small>
          <span class="delta">rekord: ${formatNumber(best.weight, 2)} kg × ${best.reps} (${formatDate(best.performed_on)})</span></p>` : ''}
        ${exerciseNames.length ? htmlChart(liftPoints, 'kg') : html`<p class="muted small">Zapisuj ciężar i liczbę powtórzeń, a zobaczysz wykres siły.</p>`}
        <details>
          <summary>${icons.plus} Dodaj wynik</summary>
          <form id="lift-form" class="stack">
            <label>Data<input type="date" name="performed_on" value="${todayIso()}" required></label>
            <label>Ćwiczenie<input name="exercise" list="lift-names" value="${state.exercise ?? ''}" required></label>
            <div class="grid-2">
              <label>Ciężar (kg)<input name="weight" inputmode="decimal" required></label>
              <label>Powtórzenia<input name="reps" type="number" min="1" inputmode="numeric" required></label>
            </div>
            <label>Notatka<input name="note"></label>
            <button class="btn" type="submit">Zapisz wynik</button>
          </form>
          <datalist id="lift-names">${[...new Set([...exerciseNames, ...COMMON_EXERCISES])].map((n) => html`<option value="${n}">`)}</datalist>
        </details>
      </section>

      <section class="card">
        <h2>Historia</h2>
        ${history.length ? html`<ul class="history">${history.map((h) => html`
          <li>
            <span class="date">${formatDate(h.date)}</span>
            <span class="grow">${h.text}${h.note ? html`<br><span class="muted small">${h.note}</span>` : ''}</span>
            <button class="icon-btn danger" data-delete="${h.kind}:${h.id}" aria-label="Usuń wpis">${icons.trash}</button>
          </li>`)}</ul>` : html`<p class="muted small">Brak wpisów.</p>`}
      </section>`;
  }

  container.addEventListener('click', async (event) => {
    const chip = event.target.closest('[data-metric]');
    if (chip) {
      state.metric = chip.dataset.metric;
      return draw();
    }
    const del = event.target.closest('[data-delete]');
    if (del && confirm('Usunąć ten wpis?')) {
      const [kind, id] = del.dataset.delete.split(':');
      await (kind === 'metric' ? api.deleteMetric(id) : api.deleteLift(id));
      toast('Wpis usunięty');
      draw();
    }
  });

  container.addEventListener('change', (event) => {
    if (event.target.id === 'exercise-select') {
      state.exercise = event.target.value;
      draw();
    }
  });

  container.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const data = formData(form);
    await submitting(form, async () => {
      if (form.id === 'metric-form') {
        const metric = {
          measured_on: data.measured_on,
          weight: toNumber(data.weight),
          waist: toNumber(data.waist),
          body_fat: toNumber(data.body_fat),
          note: data.note.trim(),
        };
        if (metric.weight == null && metric.waist == null && metric.body_fat == null) {
          throw new Error('Wpisz przynajmniej jedną wartość.');
        }
        await api.addMetric(clientId, metric);
      } else {
        const weight = toNumber(data.weight);
        const reps = Math.round(toNumber(data.reps) ?? 0);
        if (weight == null || weight < 0 || reps < 1) throw new Error('Podaj poprawny ciężar i liczbę powtórzeń.');
        state.exercise = data.exercise.trim();
        await api.addLift(clientId, { performed_on: data.performed_on, exercise: state.exercise, weight, reps, note: data.note.trim() });
      }
      toast('Zapisano', 'success');
      await draw();
    });
  });

  await draw();
}

// lineChart buduje SVG wyłącznie z liczb i dat, więc można go wstawić bez escapowania.
function htmlChart(points, unit) {
  return html`<div class="chart-wrap">${raw(lineChart(points, { unit }))}</div>`;
}

// Dla każdego dnia bierze najlepszy szacowany 1RM.
function bestPerDay(lifts) {
  const byDay = new Map();
  for (const l of lifts) {
    const value = estimatedOneRepMax(l.weight, l.reps);
    if (!byDay.has(l.performed_on) || byDay.get(l.performed_on) < value) byDay.set(l.performed_on, value);
  }
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value: Math.round(value * 10) / 10 }));
}

// ============================================================
// Konto
// ============================================================

async function viewAccount() {
  const coach = me.coach_id ? await api.getProfile(me.coach_id) : null;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  renderShell({
    title: 'Konto',
    nav: 'account',
    body: html`
      <section class="card profile">
        <span class="avatar avatar-lg">${initials(me.full_name)}</span>
        <div><strong>${me.full_name}</strong><br>
          <span class="muted small">${me.role === 'coach' ? 'Trener' : 'Podopieczny'}${coach ? html` · trener: ${coach.full_name}` : ''}</span></div>
      </section>

      ${me.role === 'coach' ? inviteCard() : ''}

      ${standalone ? '' : html`<section class="card">
        <h2>Zainstaluj aplikację</h2>
        ${installPrompt
          ? html`<p class="muted small">Dodaj aplikację do ekranu głównego, aby otwierać ją jak zwykłą aplikację.</p>
              <button class="btn" id="install">${icons.download} Zainstaluj</button>`
          : isIos
            ? html`<p class="small">W Safari stuknij <strong>Udostępnij</strong> ${icons.share}, a potem <strong>Do ekranu początkowego</strong>.</p>`
            : html`<p class="small">Otwórz menu przeglądarki (⋮) i wybierz <strong>Zainstaluj aplikację</strong> lub <strong>Dodaj do ekranu głównego</strong>.</p>`}
      </section>`}

      <button class="btn btn-outline btn-block" id="logout">${icons.logout} Wyloguj</button>
      ${api.mode === 'demo' ? html`<button class="btn btn-ghost btn-block" id="reset-demo">Przywróć dane demo</button>` : ''}`,
  });

  bindInvite();
  $('#install')?.addEventListener('click', async () => {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    viewAccount();
  });
  $('#logout').addEventListener('click', async () => {
    await api.signOut();
    go('/');
  });
  $('#reset-demo')?.addEventListener('click', () => {
    if (!confirm('Przywrócić przykładowe dane? Twoje zmiany w trybie demo zostaną usunięte.')) return;
    api.resetDemo();
    go('/');
  });
}
