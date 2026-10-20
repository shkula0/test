import { api } from './data/index.js';
import { lineChart } from './chart.js';
import { icons } from './icons.js';
import { viewLibrary, viewExercise, viewExerciseEditor, normalize } from './library.js';
import { exerciseThumb, hasMedia } from './media.js';
import { bodySection, describeMetricRow, metricSourceLabel, readMetricForm } from './measurements.js';
import {
  blankTarget, cleanTargets, letterFor, planLabels, planTargets, targetText, targetsSummary,
} from './plan-utils.js';
import { previousByExercise, viewWorkout, viewWorkoutEditor, workoutList } from './workouts.js';
import {
  $, $$, html, raw, toast, todayIso, formatDate, formatNumber, initials,
  estimatedOneRepMax, formData, toNumber,
} from './ui.js';

const app = document.getElementById('app');
let me = null;
let installPrompt = null;

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
    const ctx = { me, renderShell, emptyState, submitting, go, viewNotFound };
    if (section === 'exercises' && isCoach) return viewLibrary(ctx, params);
    if (section === 'exercise' && id === 'new' && isCoach) return viewExerciseEditor(ctx, null);
    if (section === 'exercise' && id && action === 'edit' && isCoach) return viewExerciseEditor(ctx, id);
    if (section === 'exercise' && id) return viewExercise(ctx, id, params);
    if (section === 'workout' && id === 'new') return viewWorkoutEditor(ctx, { planId: params.get('plan'), day: params.get('day') ?? '' });
    if (section === 'workout' && id && action === 'edit') return viewWorkoutEditor(ctx, { workoutId: id });
    if (section === 'workout' && id) return viewWorkout(ctx, id);
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
        : html`<img class="topbar-logo" src="icons/logo-256.png" alt="">`}
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
    ? [['clients', '/', 'Podopieczni', icons.users], ['library', '/exercises', 'Ćwiczenia', icons.logo], ['account', '/account', 'Konto', icons.user]]
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
      <img class="auth-logo" src="icons/logo-256.png" alt="Logo">
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
      <img class="auth-logo" src="icons/logo-256.png" alt="Logo">
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
        app.innerHTML = html`<main class="auth"><img class="auth-logo" src="icons/logo-256.png" alt="Logo">
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
      <div class="tabs">${tabLink('plans', 'Plany')}${tabLink('workouts', 'Treningi')}${tabLink('progress', 'Postępy')}</div>
      <div id="tab-content"></div>`,
  });

  const container = $('#tab-content');
  if (tab === 'progress') {
    await mountProgress(container, clientId);
  } else if (tab === 'workouts') {
    container.innerHTML = await workoutsSection(clientId,
      'Brak zapisanych treningów. Otwórz plan i przy wybranym dniu kliknij „Rozpocznij trening”.');
  } else {
    const plans = await api.listPlans(clientId);
    container.innerHTML = html`
      <a class="btn btn-block" href="#/plan/new/${clientId}">${icons.plus} Nowy plan</a>
      ${plans.length ? planList(plans) : emptyState('Ten podopieczny nie ma jeszcze planu treningowego.')}`;
  }
}

async function workoutsSection(clientId, emptyText, limit = Infinity) {
  const [workouts, sets] = await Promise.all([api.listWorkouts(clientId), api.listWorkoutSets(clientId)]);
  if (!workouts.length) return emptyState(emptyText);
  const setsByWorkout = new Map();
  for (const set of sets) setsByWorkout.set(set.workout_id, [...(setsByWorkout.get(set.workout_id) ?? []), set]);
  return workoutList(workouts.slice(0, limit), setsByWorkout);
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

  const [library, clientSets] = await Promise.all([api.listExercises(), api.listWorkoutSets(clientId)]);
  const FIELDS = ['name', 'rest', 'notes'];
  let nextDayId = 0;
  const newDay = (name) => ({ id: `d${nextDayId++}`, name });
  const blank = (dayId) => ({
    dayId, name: '', rest: '', notes: '', exercise_id: null, superset: false,
    targets: [blankTarget(), blankTarget(), blankTarget()], useTime: false,
  });

  // Dni to sekcje planu. Ćwiczenie bez nazwy dnia trafia do dnia nad nim
  // (naprawia starsze plany, w których dzień wpisywano przy każdym ćwiczeniu).
  const days = [];
  let rows = [];
  for (const e of existing?.exercises ?? []) {
    const name = (e.day ?? '').trim() || days.at(-1)?.name || 'Dzień A';
    let day = days.find((d) => normalize(d.name) === normalize(name));
    if (!day) days.push(day = newDay(name));
    rows.push({
      ...Object.fromEntries(FIELDS.map((f) => [f, e[f] ?? ''])),
      dayId: day.id,
      exercise_id: e.exercise_id ?? null,
      superset: Boolean(e.superset),
      targets: planTargets(e),
    });
    rows.at(-1).useTime = rows.at(-1).targets.some((t) => t.time.trim());
  }
  if (!days.length) {
    days.push(newDay('Dzień A'));
    rows.push(blank(days[0].id));
  }
  const dayOrder = (row) => days.findIndex((d) => d.id === row.dayId);
  const sortRows = () => {
    rows = rows.map((r, i) => [r, i]).sort(([a, i], [b, j]) => dayOrder(a) - dayOrder(b) || i - j).map(([r]) => r);
  };
  sortRows();

  // Szare podpowiedzi: co podopieczny zrobił w danym ćwiczeniu na ostatnim treningu
  // (najpierw z tego planu i dnia, potem z dowolnego treningu).
  const lastByDay = new Map();
  const lastResult = (row) => {
    const dayName = days.find((d) => d.id === row.dayId)?.name ?? '';
    if (!lastByDay.has(dayName)) lastByDay.set(dayName, previousByExercise(clientSets, { planId, day: dayName }));
    return lastByDay.get(dayName).get(normalize(row.name)) ?? null;
  };

  renderShell({
    title: existing ? 'Edytuj plan' : 'Nowy plan',
    back: existing ? `/plan/${planId}` : `/client/${clientId}`,
    nav: 'clients',
    body: html`
      <p class="muted">Dla: <strong>${client.full_name}</strong></p>
      <form id="plan-form" class="stack" autocomplete="off">
        <section class="card stack">
          <label>Nazwa planu<input name="planName" value="${existing?.plan.name ?? ''}" placeholder="np. FBW – 3× w tygodniu" required></label>
          <label>Uwagi dla podopiecznego<textarea name="planNotes" rows="3" placeholder="Rozgrzewka, wskazówki, częstotliwość…">${existing?.plan.notes ?? ''}</textarea></label>
        </section>
        <div id="rows" class="stack"></div>
        <button type="button" class="btn btn-outline btn-block" id="add-day">${icons.plus} Dodaj dzień (kolejny trening)</button>
        <div class="sticky-actions"><button class="btn btn-block" type="submit">Zapisz plan</button></div>
      </form>`,
  });

  const findInLibrary = (name) => library.find((e) => normalize(e.name) === normalize(name));
  const linkHint = (r) => {
    if (!r.name.trim()) return '';
    const linked = library.find((e) => e.id === r.exercise_id);
    if (!linked) return html`<span class="muted">Spoza biblioteki – bez zdjęcia i filmu.</span>`;
    return hasMedia(linked) ? html`<span class="ok">✓ Z biblioteki, ze zdjęciem lub filmem</span>` : html`<span class="ok">✓ Z biblioteki</span>`;
  };

  // Inputy mają data-field zamiast name, żeby przeglądarka nie podpowiadała tu imienia i nazwiska.
  const rowsEl = $('#rows');
  const drawRows = () => {
    const labels = planLabels(rows.map((r) => ({ ...r, day: r.dayId })));
    const exerciseCard = (r, i, last = lastResult(r)) => html`
      <fieldset class="card exercise-edit ${labels[i].size > 1 ? 'in-superset' : ''} ${labels[i].joined ? 'joined' : ''}" data-index="${i}">
        ${labels[i].canJoin ? html`<label class="superset-toggle">
          <input type="checkbox" data-superset ${r.superset ? 'checked' : ''}>
          <span>Superseria z poprzednim ćwiczeniem</span>
        </label>` : ''}
        <div class="row">
          <span class="ex-label" title="Oznaczenie w planie">${labels[i].label}</span>
          <span class="grow"></span>
          <button type="button" class="icon-btn" data-move="-1" aria-label="Przesuń w górę" ${rows[i - 1]?.dayId !== r.dayId ? 'disabled' : ''}>${icons.up}</button>
          <button type="button" class="icon-btn" data-move="1" aria-label="Przesuń w dół" ${rows[i + 1]?.dayId !== r.dayId ? 'disabled' : ''}>${icons.down}</button>
          <button type="button" class="icon-btn danger" data-remove aria-label="Usuń ćwiczenie">${icons.trash}</button>
        </div>
        <div class="combo">
          <label>Ćwiczenie<input data-field="name" value="${r.name}" required autocomplete="off" placeholder="Zacznij pisać, aby wyszukać…"
            role="combobox" aria-autocomplete="list" aria-expanded="false"></label>
          <div class="combo-list" role="listbox" hidden></div>
          <p class="combo-hint small">${linkHint(r)}</p>
        </div>
        ${last ? html`<p class="muted small last-hint"><span class="ghost-sample">Szare</span> = ostatni trening (${formatDate(last.date)})</p>` : ''}
        <table class="sets plan-sets ${r.useTime ? 'with-time' : ''}">
          <thead><tr><th>Seria</th><th>${r.useTime ? 'Czas (s)' : 'Powt.'}</th><th>kg</th><th>Intens.</th></tr></thead>
          <tbody>${r.targets.map((t, ti) => html`<tr data-target="${ti}">
            <td><span class="set-no">${ti + 1}</span></td>
            ${r.useTime
              ? html`<td><input data-t="time" value="${t.time}" inputmode="numeric" autocomplete="off" aria-label="Czas seria ${ti + 1}"
                  placeholder="${last?.sets[ti]?.duration_s ?? ''}"></td>`
              : html`<td><input data-t="reps" value="${t.reps}" autocomplete="off" aria-label="Powtórzenia seria ${ti + 1}"
                  placeholder="${last?.sets[ti]?.reps ?? ''}"></td>`}
            <td><input data-t="weight" value="${t.weight}" inputmode="decimal" autocomplete="off" aria-label="Ciężar seria ${ti + 1}"
              placeholder="${Number(last?.sets[ti]?.weight) > 0 ? formatNumber(last.sets[ti].weight, 2) : ''}"></td>
            <td><input data-t="effort" value="${t.effort}" autocomplete="off" aria-label="Intensywność seria ${ti + 1}"></td>
          </tr>`)}</tbody>
        </table>
        <div class="wk-actions">
          <button type="button" class="chip" data-add-target ${r.targets.length >= 12 ? 'disabled' : ''}>${icons.plus} Seria</button>
          <button type="button" class="chip" data-remove-target ${r.targets.length <= 1 ? 'disabled' : ''}>− Seria</button>
          <label class="chip chip-check ${r.useTime ? 'active' : ''}"><input type="checkbox" data-use-time ${r.useTime ? 'checked' : ''}> Na czas (s)</label>
        </div>
        <p class="muted small plan-sets-hint">Intens. = np. 60% albo RPE 8. Puste pola zostaw – podopieczny ich nie zobaczy.</p>
        <div class="grid-2">
          <label>Przerwa<input data-field="rest" value="${r.rest}" autocomplete="off" placeholder="np. 90 s"></label>
          <label>Wskazówki<input data-field="notes" value="${r.notes}" placeholder="np. tempo, technika" autocomplete="off"></label>
        </div>
      </fieldset>`;
    rowsEl.innerHTML = html`${days.map((day) => {
      const dayRows = rows.map((r, i) => [r, i]).filter(([r]) => r.dayId === day.id);
      return html`
        <section class="day-edit" data-day="${day.id}">
          <div class="day-edit-head">
            <input class="day-name" data-day-name value="${day.name}" placeholder="Nazwa dnia, np. Dzień A" aria-label="Nazwa dnia" autocomplete="off" required>
            <button type="button" class="icon-btn danger" data-remove-day aria-label="Usuń dzień" ${days.length === 1 ? 'disabled' : ''}>${icons.trash}</button>
          </div>
          ${dayRows.map(([r, i]) => exerciseCard(r, i))}
          ${dayRows.length ? '' : html`<p class="muted small">Ten dzień nie ma jeszcze ćwiczeń.</p>`}
          <button type="button" class="btn btn-outline btn-block" data-add-row>${icons.plus} Dodaj ćwiczenie</button>
        </section>`;
    })}`;
  };
  drawRows();

  const showSuggestions = (fieldset) => {
    const i = Number(fieldset.dataset.index);
    const query = normalize(rows[i].name);
    const matches = library
      .filter((e) => !query || normalize(e.name).includes(query))
      .sort((a, b) => Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)))
      .slice(0, 8);
    const exact = findInLibrary(rows[i].name);
    const list = $('.combo-list', fieldset);
    list.innerHTML = html`
      ${matches.map((e) => html`<button type="button" class="combo-option" role="option" data-pick="${e.id}">
        ${exerciseThumb(e)}<span class="grow">${e.name}<br><span class="muted small">${e.category}</span></span>
      </button>`)}
      ${rows[i].name.trim() && !exact ? html`<button type="button" class="combo-option combo-add" data-add-to-library>
        ${icons.plus}<span class="grow">Dodaj „${rows[i].name.trim()}” do biblioteki</span></button>` : ''}
      ${!matches.length && !rows[i].name.trim() ? html`<p class="muted small combo-empty">Biblioteka jest pusta.</p>` : ''}`;
    list.hidden = false;
    $('[data-field=name]', fieldset).setAttribute('aria-expanded', 'true');
  };

  const hideSuggestions = (fieldset) => {
    $('.combo-list', fieldset).hidden = true;
    $('[data-field=name]', fieldset).setAttribute('aria-expanded', 'false');
  };

  const refreshHint = (fieldset) => {
    $('.combo-hint', fieldset).innerHTML = linkHint(rows[fieldset.dataset.index]);
  };

  const pick = (fieldset, exercise) => {
    const row = rows[fieldset.dataset.index];
    row.name = exercise.name;
    row.exercise_id = exercise.id;
    // Przerysowanie pokazuje szare wyniki z ostatniego treningu dla wybranego ćwiczenia.
    const index = fieldset.dataset.index;
    drawRows();
    $(`[data-index="${index}"] [data-t=reps], [data-index="${index}"] [data-t=time]`, rowsEl)?.focus();
  };

  rowsEl.addEventListener('input', (event) => {
    if ('dayName' in event.target.dataset) {
      days.find((d) => d.id === event.target.closest('[data-day]').dataset.day).name = event.target.value;
      return;
    }
    const fieldset = event.target.closest('[data-index]');
    if (event.target.dataset.t && fieldset) {
      const ti = Number(event.target.closest('[data-target]').dataset.target);
      rows[fieldset.dataset.index].targets[ti][event.target.dataset.t] = event.target.value;
      return;
    }
    const field = event.target.dataset.field;
    if (!field || !fieldset) return;
    const row = rows[fieldset.dataset.index];
    row[field] = event.target.value;
    if (field === 'name') {
      row.exercise_id = findInLibrary(row.name)?.id ?? null;
      showSuggestions(fieldset);
      refreshHint(fieldset);
    }
  });
  rowsEl.addEventListener('change', (event) => {
    const fieldset = event.target.closest('[data-index]');
    if (!fieldset) return;
    if ('superset' in event.target.dataset) {
      rows[fieldset.dataset.index].superset = event.target.checked;
      drawRows();
    } else if ('useTime' in event.target.dataset) {
      rows[fieldset.dataset.index].useTime = event.target.checked;
      drawRows();
    }
  });
  rowsEl.addEventListener('focusin', (event) => {
    if (event.target.dataset.field === 'name') showSuggestions(event.target.closest('[data-index]'));
  });
  rowsEl.addEventListener('focusout', (event) => {
    if (event.target.dataset.field !== 'name') return;
    const fieldset = event.target.closest('[data-index]');
    // Opóźnienie, żeby kliknięcie w podpowiedź zdążyło się wykonać.
    setTimeout(() => {
      if (!fieldset.contains(document.activeElement) || document.activeElement.dataset.field !== 'name') hideSuggestions(fieldset);
    }, 200);
  });
  rowsEl.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && event.target.dataset.field === 'name') hideSuggestions(event.target.closest('[data-index]'));
  });
  // Kliknięcie w podpowiedź nie powinno zabierać fokusu z pola (inaczej lista znika przed kliknięciem).
  rowsEl.addEventListener('mousedown', (event) => {
    if (event.target.closest('.combo-option')) event.preventDefault();
  });

  rowsEl.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const dayId = button.closest('[data-day]')?.dataset.day;
    if ('addRow' in button.dataset) {
      // Nowe ćwiczenie na końcu tego dnia.
      const lastInDay = rows.findLastIndex((r) => r.dayId === dayId);
      const at = lastInDay >= 0 ? lastInDay + 1 : rows.findIndex((r) => dayOrder(r) > days.findIndex((d) => d.id === dayId));
      rows.splice(at >= 0 ? at : rows.length, 0, blank(dayId));
      drawRows();
      $$(`[data-day="${dayId}"] [data-field=name]`, rowsEl).at(-1).focus();
      return;
    }
    if ('removeDay' in button.dataset) {
      const day = days.find((d) => d.id === dayId);
      const count = rows.filter((r) => r.dayId === dayId && r.name.trim()).length;
      if (count && !confirm(`Usunąć „${day.name}” razem z ćwiczeniami (${count})?`)) return;
      days.splice(days.indexOf(day), 1);
      rows = rows.filter((r) => r.dayId !== dayId);
      drawRows();
      return;
    }
    const fieldset = button.closest('[data-index]');
    if (!fieldset) return;
    const i = Number(fieldset.dataset.index);
    if (button.dataset.pick) {
      pick(fieldset, library.find((e) => e.id === button.dataset.pick));
      return;
    }
    if ('addToLibrary' in button.dataset) {
      const name = rows[i].name.trim();
      button.disabled = true;
      try {
        const id = await api.saveExercise({ name, category: '', description: '', video_url: '', is_public: false });
        const created = await api.getExercise(id);
        library.push(created);
        pick(fieldset, created);
        toast(`Dodano „${name}” do biblioteki – zdjęcie lub film dodasz w zakładce Ćwiczenia`, 'success');
      } catch (error) {
        toast(error.message, 'error');
        button.disabled = false;
      }
      return;
    }
    if ('addTarget' in button.dataset) {
      rows[i].targets.push({ ...(rows[i].targets.at(-1) ?? blankTarget()) });
    } else if ('removeTarget' in button.dataset) {
      rows[i].targets.pop();
    } else if (button.dataset.move) {
      const j = i + Number(button.dataset.move);
      [rows[i], rows[j]] = [rows[j], rows[i]];
    } else if ('remove' in button.dataset) {
      rows.splice(i, 1);
    }
    drawRows();
  });
  $('#add-day').addEventListener('click', () => {
    const taken = new Set(days.map((d) => normalize(d.name)));
    let n = days.length;
    while (taken.has(normalize(`Dzień ${letterFor(n)}`))) n += 1;
    const day = newDay(`Dzień ${letterFor(n)}`);
    days.push(day);
    rows.push(blank(day.id));
    drawRows();
    $$(`[data-day="${day.id}"] [data-field=name]`, rowsEl).at(-1).focus();
  });

  $('#plan-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const { planName, planNotes } = formData(event.target);
    const names = days.map((d) => normalize(d.name));
    if (names.some((n, i) => names.indexOf(n) !== i)) {
      toast('Dwa dni mają tę samą nazwę – zmień jedną z nich.', 'error');
      return;
    }
    const dayName = (row) => days.find((d) => d.id === row.dayId).name.trim();
    const filled = rows
      .map((r) => {
        // Ćwiczenie „Na czas” ma tylko czas, pozostałe tylko powtórzenia.
        const targets = cleanTargets(r.targets).map((t) => (r.useTime ? { ...t, reps: '' } : { ...t, time: '' }));
        // Starsze pola (serie / powtórzenia / ciężar) jako skrót – dla zgodności wstecz.
        const joined = (f) => {
          const values = [...new Set(targets.map((t) => t[f]))];
          return values.length === 1 ? values[0] : targets.map((t) => t[f] || '–').join('/');
        };
        return {
          ...Object.fromEntries(FIELDS.map((f) => [f, r[f].trim()])),
          day: dayName(r), exercise_id: r.exercise_id, superset: r.superset,
          set_targets: targets, sets: String(targets.length), reps: joined('reps'), weight: joined('weight'),
        };
      })
      .filter((r) => r.name);
    // Superseria tylko tam, gdzie jest poprzednie ćwiczenie w tym samym dniu.
    const labels = planLabels(filled);
    const exercises = filled.map((r, i) => ({ ...r, superset: r.superset && labels[i].canJoin }));
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
  const [data, library] = await Promise.all([api.getPlan(planId), api.listExercises()]);
  if (!data) return viewNotFound();
  const { plan, exercises } = data;
  const isCoach = me.role === 'coach';
  const libraryById = new Map(library.map((e) => [e.id, e]));

  // Dni → grupy (pojedyncze ćwiczenie albo superseria) → ćwiczenia z oznaczeniem.
  const labels = planLabels(exercises);
  const days = [];
  exercises.forEach((ex, i) => {
    const day = ex.day || 'Ćwiczenia';
    if (days.at(-1)?.day !== day) days.push({ day, rawDay: ex.day || '', groups: [] });
    const groups = days.at(-1).groups;
    if (!labels[i].joined) groups.push([]);
    groups.at(-1).push({ ex, label: labels[i].label });
  });

  const exerciseItem = ({ ex, label }) => {
    const info = libraryById.get(ex.exercise_id);
    const body = html`
      <strong>${ex.name}</strong>
      ${details(ex) ? html`<span class="ex-details">${details(ex)}</span>` : ''}
      ${setLines(ex)}
      ${ex.notes ? html`<span class="muted small">${ex.notes}</span>` : ''}
      ${info && (hasMedia(info) || info.description) ? html`<span class="ex-link">${icons.play} ${hasMedia(info) ? 'Zobacz, jak wykonać' : 'Opis techniki'}</span>` : ''}`;
    const content = html`<span class="ex-label">${label}</span><span class="ex-text">${body}</span>${info ? exerciseThumb(info) : ''}`;
    return info
      ? html`<li><a class="ex-row" href="#/exercise/${info.id}?back=/plan/${plan.id}">${content}</a></li>`
      : html`<li><span class="ex-row">${content}</span></li>`;
  };

  // Jednakowe serie w jednej linijce, różne – każda seria osobno.
  const details = (ex) => [targetsSummary(planTargets(ex)), ex.rest && `przerwa ${ex.rest}`].filter(Boolean).join(' · ');
  const setLines = (ex) => {
    const targets = planTargets(ex);
    if (targetsSummary(targets)) return '';
    return html`<span class="set-lines">${targets.map((t, n) => html`<span><b>${n + 1}.</b> ${targetText(t) || '–'}</span>`)}</span>`;
  };

  renderShell({
    title: plan.name,
    back: isCoach ? `/client/${plan.client_id}` : '/',
    nav: isCoach ? 'clients' : 'plans',
    body: html`
      ${plan.notes ? html`<section class="card note">${plan.notes}</section>` : ''}
      ${days.length ? days.map(({ day, rawDay, groups }) => html`
        <section class="day">
          <div class="day-head">
            <h2>${day}</h2>
            <a class="btn btn-small" href="#/workout/new?plan=${plan.id}&day=${encodeURIComponent(rawDay)}">${icons.play} Rozpocznij trening</a>
          </div>
          <ol class="card exercises">${groups.map((group) => (group.length > 1
            ? html`<li class="superset">
                <p class="superset-head">${icons.link} Superseria – wykonuj jedno po drugim, bez przerwy między ćwiczeniami</p>
                <ol>${group.map(exerciseItem)}</ol>
              </li>`
            : exerciseItem(group[0])))}
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
      ${plans.length ? planList(plans) : emptyState('Trener nie przygotował jeszcze dla Ciebie planu. Zajrzyj tu wkrótce!')}
      <h2>Ostatnie treningi</h2>
      <div id="my-workouts"></div>`,
  });
  $('#my-workouts').innerHTML = await workoutsSection(me.id, 'Nie masz jeszcze zapisanych treningów. Otwórz plan i kliknij „Rozpocznij trening”.', 10);
}

async function viewMyProgress() {
  renderShell({ title: 'Postępy', nav: 'progress', body: html`<div id="progress"></div>` });
  await mountProgress($('#progress'), me.id);
}

// ============================================================
// Postępy: pomiary ciała i wyniki w ćwiczeniach
// ============================================================

async function mountProgress(container, clientId) {
  const state = { group: 'self', metric: 'weight', formOpen: false, exercise: null };

  async function draw() {
    const [metrics, lifts, library, workoutSets] = await Promise.all([
      api.listMetrics(clientId), api.listLifts(clientId), api.listExercises(), api.listWorkoutSets(clientId),
    ]);
    // Do wykresów siły trafiają też serie z zapisanych treningów.
    const strength = [
      ...lifts,
      ...workoutSets.filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0)
        .map((s) => ({ exercise: s.exercise_name, weight: Number(s.weight), reps: Number(s.reps), performed_on: s.performed_on })),
    ];
    const exerciseNames = [...new Set(strength.map((l) => l.exercise))].sort((a, b) => a.localeCompare(b, 'pl'));
    if (!exerciseNames.includes(state.exercise)) state.exercise = exerciseNames[0] ?? null;

    const exerciseLifts = strength.filter((l) => l.exercise === state.exercise);
    const liftPoints = bestPerDay(exerciseLifts);
    const best = exerciseLifts.reduce((top, l) => (!top || estimatedOneRepMax(l.weight, l.reps) > estimatedOneRepMax(top.weight, top.reps) ? l : top), null);

    const history = [
      ...metrics.map((m) => ({ kind: 'metric', id: m.id, date: m.measured_on, created: m.created_at,
        text: describeMetricRow(m), tag: metricSourceLabel(m), note: m.note })),
      ...lifts.map((l) => ({ kind: 'lift', id: l.id, date: l.performed_on, created: l.created_at,
        text: `${l.exercise}: ${formatNumber(l.weight, 2)} kg × ${l.reps}`, note: l.note })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));

    container.innerHTML = html`
      ${progressCard(exerciseProgress(strength), state.exercise)}

      ${bodySection(metrics, state)}

      <section class="card">
        <div class="card-head">
          <h2>Wyniki w ćwiczeniach</h2>
          ${exerciseNames.length ? html`<select id="exercise-select" aria-label="Ćwiczenie">
            ${exerciseNames.map((n) => html`<option ${n === state.exercise ? 'selected' : ''}>${n}</option>`)}
          </select>` : ''}
        </div>
        ${best ? html`<p class="stat">${formatNumber(estimatedOneRepMax(best.weight, best.reps))} <small>kg szac. 1RM</small>
          <span class="delta">rekord: ${formatNumber(best.weight, 2)} kg × ${best.reps} (${formatDate(best.performed_on)})</span></p>` : ''}
        ${exerciseNames.length ? htmlChart(liftPoints, 'kg') : html`<p class="muted small">Zapisuj treningi albo dodawaj wyniki poniżej, a zobaczysz wykres siły.</p>`}
        ${exerciseNames.length ? html`<p class="muted small">Wykres obejmuje serie z zapisanych treningów i wyniki dodane ręcznie.</p>` : ''}
        <details>
          <summary>${icons.plus} Dodaj wynik</summary>
          <form id="lift-form" class="stack">
            <label>Data<input type="date" name="performed_on" value="${todayIso()}" required></label>
            <label>Ćwiczenie<input name="exercise" list="lift-names" value="${state.exercise ?? ''}" required autocomplete="off"></label>
            <div class="grid-2">
              <label>Ciężar (kg)<input name="weight" inputmode="decimal" required></label>
              <label>Powtórzenia<input name="reps" type="number" min="1" inputmode="numeric" required></label>
            </div>
            <label>Notatka<input name="note"></label>
            <button class="btn" type="submit">Zapisz wynik</button>
          </form>
          <datalist id="lift-names">${[...new Set([...exerciseNames, ...library.map((e) => e.name)])].map((n) => html`<option value="${n}">`)}</datalist>
        </details>
      </section>

      <section class="card">
        <h2>Historia</h2>
        ${history.length ? html`<ul class="history">${history.map((h) => html`
          <li>
            <span class="date">${formatDate(h.date)}</span>
            <span class="grow">${h.tag ? html`<span class="tag">${h.tag}</span> ` : ''}${h.text}${h.note ? html`<br><span class="muted small">${h.note}</span>` : ''}</span>
            <button class="icon-btn danger" data-delete="${h.kind}:${h.id}" aria-label="Usuń wpis">${icons.trash}</button>
          </li>`)}</ul>` : html`<p class="muted small">Brak wpisów.</p>`}
      </section>`;
  }

  container.addEventListener('click', async (event) => {
    const tile = event.target.closest('[data-metric]');
    if (tile) {
      state.metric = tile.dataset.metric;
      await draw();
      $('.chart-title', container)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const progressRow = event.target.closest('[data-progress]');
    if (progressRow) {
      state.exercise = progressRow.dataset.progress;
      await draw();
      $('#exercise-select', container)?.closest('section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const groupTab = event.target.closest('[data-group]');
    if (groupTab && groupTab.tagName === 'BUTTON') {
      state.group = groupTab.dataset.group;
      state.metric = null;
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
        await api.addMetric(clientId, readMetricForm(data, form.dataset.group));
        state.formOpen = false;
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

// Progres ciężaru w każdym ćwiczeniu: najcięższa seria z pierwszego treningu
// z tym ćwiczeniem vs najcięższa seria z ostatniego treningu.
function exerciseProgress(strength) {
  const byExercise = new Map();
  for (const l of strength) {
    if (!(Number(l.weight) > 0)) continue;
    if (!byExercise.has(l.exercise)) byExercise.set(l.exercise, new Map());
    const days = byExercise.get(l.exercise);
    days.set(l.performed_on, Math.max(days.get(l.performed_on) ?? 0, Number(l.weight)));
  }
  return [...byExercise].map(([exercise, days]) => {
    const dates = [...days.keys()].sort();
    const first = { date: dates[0], weight: days.get(dates[0]) };
    const last = { date: dates.at(-1), weight: days.get(dates.at(-1)) };
    const sessions = dates.length;
    const kg = last.weight - first.weight;
    return { exercise, first, last, sessions, kg, percent: (kg / first.weight) * 100 };
  }).sort((a, b) => (b.sessions > 1) - (a.sessions > 1) || b.percent - a.percent || a.exercise.localeCompare(b.exercise, 'pl'));
}

function progressCard(rows, selected) {
  const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');
  return html`<section class="card">
    <h2>Progres w ćwiczeniach</h2>
    <p class="muted small">Najcięższa seria: pierwszy trening z danym ćwiczeniem → ostatni trening.</p>
    ${rows.length ? html`<ul class="progress-list">${rows.map((r) => {
      const tone = r.kg > 0 ? 'good' : r.kg < 0 ? 'bad' : '';
      return html`<li><button type="button" class="progress-row ${r.exercise === selected ? 'active' : ''}" data-progress="${r.exercise}">
        <span class="grow">
          <strong>${r.exercise}</strong>
          <span class="muted small">${formatNumber(r.first.weight, 2)} kg (${formatDate(r.first.date).slice(0, 5)})
            ${r.sessions > 1 ? html`→ <strong class="text">${formatNumber(r.last.weight, 2)} kg</strong> (${formatDate(r.last.date).slice(0, 5)})` : '· na razie 1 trening'}</span>
        </span>
        ${r.sessions > 1 ? html`<span class="progress-value ${tone}">
          <span class="progress-percent">${sign(r.kg)}${formatNumber(Math.abs(r.percent), 0)}%</span>
          <span class="progress-kg">${sign(r.kg)}${formatNumber(Math.abs(r.kg), 2)} kg</span>
        </span>` : ''}
      </button></li>`;
    })}</ul>` : html`<p class="muted small">Pojawi się po zapisaniu treningów z ciężarem.</p>`}
  </section>`;
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
