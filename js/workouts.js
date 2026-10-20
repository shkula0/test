// Dziennik treningów: rozpoczęcie treningu z planu, wpisywanie serii z podglądem
// poprzedniego treningu, podsumowanie i historia.

import { api } from './data/index.js';
import { icons } from './icons.js';
import { normalize } from './library.js';
import { exerciseThumb } from './media.js';
import { isTimeBased, planLabels, planTargets, targetText } from './plan-utils.js';
import { $, html, toast, todayIso, formatDate, formatNumber, toNumber } from './ui.js';

const MAX_SETS = 12;

// Liczba w polu formularza po polsku: 57.5 → „57,5”.
const inputNumber = (value) => String(value).replace('.', ',');

// 1 seria, 2 serie, 5 serii
function plural(n, one, few, many) {
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

// Liczba z pola planu, jeśli to zwykła liczba („60” → 60, „8–10” → null).
function plainNumber(text) {
  const value = String(text ?? '').trim();
  return /^\d+([.,]\d+)?$/.test(value) ? Number(value.replace(',', '.')) : null;
}

export function formatSet(set) {
  const weight = set.weight != null && Number(set.weight) > 0 ? `${formatNumber(set.weight, 2)} kg` : '';
  const amount = set.duration_s != null ? `${set.duration_s} s` : set.reps != null ? `${set.reps}` : '';
  if (weight && amount) return `${weight} × ${amount}`;
  return weight || (set.duration_s != null ? amount : amount ? `${amount} powt.` : '–');
}

function volumeOf(sets) {
  return sets.reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
}

// Dla każdego ćwiczenia: serie z ostatniego treningu, w którym było robione.
// Najpierw szukamy w treningach z tego samego planu i dnia, potem w pozostałych.
export function previousByExercise(allSets, { planId, day, excludeId }) {
  const workouts = new Map();
  for (const set of allSets) {
    if (set.workout_id === excludeId) continue;
    if (!workouts.has(set.workout_id)) {
      workouts.set(set.workout_id, {
        date: set.performed_on,
        created: set.workout_created_at ?? '',
        same: Boolean(planId) && set.plan_id === planId && (set.day || '') === (day || ''),
        byName: new Map(),
      });
    }
    const byName = workouts.get(set.workout_id).byName;
    const key = normalize(set.exercise_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(set);
  }
  const ordered = [...workouts.values()].sort((a, b) => Number(b.same) - Number(a.same)
    || b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  const result = new Map();
  for (const w of ordered) {
    for (const [key, sets] of w.byName) {
      if (!result.has(key)) result.set(key, { date: w.date, sets: [...sets].sort((a, b) => a.set_number - b.set_number) });
    }
  }
  return result;
}

// ============================================================
// Rozpoczęcie / edycja treningu
// ============================================================

export async function viewWorkoutEditor(ctx, { workoutId, planId, day }) {
  const { me } = ctx;
  const existing = workoutId ? await api.getWorkout(workoutId) : null;
  if (workoutId && !existing) return ctx.viewNotFound();

  const planData = await api.getPlan(existing?.workout.plan_id ?? planId).catch(() => null);
  if (!existing && !planData) return ctx.viewNotFound();

  const workout = existing?.workout ?? {
    client_id: planData.plan.client_id,
    plan_id: planData.plan.id,
    plan_name: planData.plan.name,
    day: day ?? '',
    performed_on: todayIso(),
    notes: '',
  };
  const [library, allSets] = await Promise.all([api.listExercises(), api.listWorkoutSets(workout.client_id)]);
  const libraryById = new Map(library.map((e) => [e.id, e]));
  const previous = previousByExercise(allSets, { planId: workout.plan_id, day: workout.day, excludeId: existing?.workout.id });

  // Ćwiczenia z planu (dla danego dnia) – do celów i do nowego treningu.
  const planExercises = planData?.exercises ?? [];
  const planLabelsAll = planLabels(planExercises);
  const dayExercises = planExercises
    .map((ex, i) => ({ ex, label: planLabelsAll[i] }))
    .filter(({ ex }) => (ex.day || '') === (workout.day || ''));
  const planByName = new Map(dayExercises.map(({ ex }) => [normalize(ex.name), ex]));

  const blankSet = () => ({ weight: '', reps: '', time: '', done: false });
  let items;
  if (existing) {
    const byPosition = new Map();
    for (const set of existing.sets) {
      if (!byPosition.has(set.position)) {
        byPosition.set(set.position, {
          name: set.exercise_name, exercise_id: set.exercise_id, label: set.label, joined: false, note: '', sets: [],
        });
      }
      const item = byPosition.get(set.position);
      if (set.note) item.note = set.note;
      if (set.weight != null || set.reps != null || set.duration_s != null || set.done) {
        item.sets.push({
          weight: set.weight != null ? inputNumber(set.weight) : '',
          reps: set.reps != null ? String(set.reps) : '',
          time: set.duration_s != null ? String(set.duration_s) : '',
          done: set.done,
        });
      }
    }
    items = [...byPosition.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
    items.forEach((item, i) => {
      if (!item.sets.length) item.sets.push(blankSet());
      item.joined = i > 0 && /\d$/.test(item.label) && !item.label.endsWith('1') && item.label[0] === items[i - 1].label[0];
    });
  } else {
    items = dayExercises.map(({ ex, label }) => {
      const prev = previous.get(normalize(ex.name));
      const count = planTargets(ex).length || prev?.sets.length || 1;
      return {
        name: ex.name, exercise_id: ex.exercise_id ?? null, label: label.label, joined: label.joined, note: '',
        sets: Array.from({ length: count }, blankSet),
      };
    });
  }
  items.forEach((item) => {
    item.showNote = Boolean(item.note);
    const plan = planByName.get(normalize(item.name));
    item.targets = plan ? planTargets(plan) : [];
    const prev = previous.get(normalize(item.name));
    // Ćwiczenie na czas (np. plank): zamiast powtórzeń wpisujemy sekundy.
    item.timeMode = item.targets.length
      ? isTimeBased(item.targets)
      : Boolean(prev?.sets.some((x) => x.duration_s != null) && !prev.sets.some((x) => x.reps != null))
        || item.sets.some((x) => x.time !== '' && x.reps === '');
  });

  // Szare podpowiedzi w polach: wynik z poprzedniego treningu, a jeśli go nie ma – wartości z planu.
  const ghostOf = (item, n) => {
    const prev = previous.get(normalize(item.name));
    const before = prev?.sets[n] ?? prev?.sets.at(-1);
    const target = item.targets[n] ?? item.targets.at(-1);
    const pick = (fromPrev, fromPlan) => (fromPrev != null ? fromPrev : fromPlan);
    return {
      weight: pick(before && Number(before.weight) > 0 ? Number(before.weight) : null, plainNumber(target?.weight)),
      reps: pick(before?.reps ?? null, plainNumber(target?.reps)),
      time: pick(before?.duration_s ?? null, plainNumber(target?.time)),
    };
  };

  const backTo = existing ? `/workout/${existing.workout.id}` : `/plan/${workout.plan_id}`;
  ctx.renderShell({
    title: existing ? 'Edytuj trening' : 'Trening',
    back: backTo,
    nav: me.role === 'coach' ? 'clients' : 'plans',
    body: html`
      <section class="card wk-top">
        <div class="grow">
          <strong>${workout.plan_name}</strong>${workout.day ? html` · ${workout.day}` : ''}
          <p class="muted small"><span class="ghost-sample">Szare liczby</span> to wynik z poprzedniego treningu (albo z planu, jeśli to pierwszy raz).
            Bez zmian? Stuknij numer serii, żeby ją odhaczyć. Progres? Najpierw wpisz nowy wynik.</p>
        </div>
        <label class="wk-date">Data<input type="date" id="wk-date" value="${workout.performed_on}" required></label>
      </section>
      <div id="wk-items" class="stack"></div>
      <section class="card">
        <label>Notatka do treningu<textarea id="wk-notes" rows="2" placeholder="Samopoczucie, uwagi…">${workout.notes}</textarea></label>
      </section>
      <div class="sticky-actions"><button class="btn btn-block" id="wk-save">${icons.check} Zapisz trening</button></div>`,
  });

  const container = $('#wk-items');
  const draw = () => {
    container.innerHTML = items.length ? html`${items.map((item, i) => {
      const info = libraryById.get(item.exercise_id);
      const plan = planByName.get(normalize(item.name));
      const prev = previous.get(normalize(item.name));
      const next = items[i + 1];
      const inSuperset = item.joined || next?.joined;
      return html`
        <section class="card wk-ex ${inSuperset ? 'in-superset' : ''} ${item.joined ? 'joined' : ''}" data-item="${i}">
          ${inSuperset && !item.joined ? html`<p class="superset-head">${icons.link} Superseria – jedno po drugim</p>` : ''}
          <div class="wk-head">
            <span class="ex-label">${item.label || i + 1}</span>
            <div class="grow">
              <strong>${item.name}</strong>
              ${plan?.rest ? html`<br><span class="muted small">Przerwa: ${plan.rest}</span>` : ''}
              ${plan?.notes ? html`<br><span class="muted small">${plan.notes}</span>` : ''}
              ${prev ? html`<br><span class="muted small">Poprzednio: ${formatDate(prev.date)}</span>` : ''}
            </div>
            ${info ? html`<a href="#/exercise/${info.id}" target="_blank" class="wk-thumb" aria-label="Jak wykonać">${exerciseThumb(info)}</a>` : ''}
          </div>
          <table class="sets">
            <thead><tr><th>Seria</th><th>Plan</th><th>kg</th><th>${item.timeMode ? 'Czas (s)' : 'Powt.'}</th></tr></thead>
            <tbody>${item.sets.map((set, n) => {
              const target = item.targets[n];
              const ghost = ghostOf(item, n);
              const amountKey = item.timeMode ? 'time' : 'reps';
              return html`<tr class="${set.done ? 'done' : ''}" data-set="${n}">
                <td><button type="button" class="set-no set-toggle" data-done aria-pressed="${set.done}"
                  aria-label="Seria ${n + 1} – ${set.done ? 'zrobiona, stuknij aby cofnąć' : 'stuknij aby odhaczyć'}">${n + 1}</button></td>
                <td class="set-target">${target ? targetText(target) || '–' : '–'}</td>
                <td><input data-k="weight" value="${set.weight}" inputmode="decimal" autocomplete="off" aria-label="Ciężar seria ${n + 1}"
                  placeholder="${ghost.weight != null ? formatNumber(ghost.weight, 2) : ''}"></td>
                <td><input data-k="${amountKey}" value="${set[amountKey]}" inputmode="numeric" autocomplete="off"
                  aria-label="${item.timeMode ? 'Czas' : 'Powtórzenia'} seria ${n + 1}"
                  placeholder="${ghost[amountKey] ?? ''}"></td>
              </tr>`;
            })}</tbody>
          </table>
          <div class="wk-actions">
            <button type="button" class="chip" data-add-set ${item.sets.length >= MAX_SETS ? 'disabled' : ''}>${icons.plus} Seria</button>
            <button type="button" class="chip" data-remove-set ${item.sets.length <= 1 ? 'disabled' : ''}>− Seria</button>
            <button type="button" class="chip ${item.showNote ? 'active' : ''}" data-toggle-note>${icons.edit} Notatka</button>
          </div>
          ${item.showNote ? html`<textarea data-note rows="2" placeholder="Uwagi do ćwiczenia (technika, odczucia)…">${item.note}</textarea>` : ''}
        </section>`;
    })}` : ctx.emptyState('Ten dzień planu nie ma ćwiczeń.');
  };
  draw();

  const itemOf = (el) => items[Number(el.closest('[data-item]').dataset.item)];
  const setOf = (el) => itemOf(el).sets[Number(el.closest('[data-set]').dataset.set)];
  // ✓ zatwierdza szare wartości w pustych polach; wpisane ręcznie zostają.
  const confirmGhost = (el) => {
    const item = itemOf(el);
    const set = setOf(el);
    const ghost = ghostOf(item, Number(el.closest('[data-set]').dataset.set));
    if (set.weight === '' && ghost.weight != null) set.weight = inputNumber(ghost.weight);
    const amountKey = item.timeMode ? 'time' : 'reps';
    if (set[amountKey] === '' && ghost[amountKey] != null) set[amountKey] = String(ghost[amountKey]);
  };

  container.addEventListener('input', (event) => {
    const { k } = event.target.dataset;
    if (k) setOf(event.target)[k] = event.target.value;
    if ('note' in event.target.dataset) itemOf(event.target).note = event.target.value;
  });

  container.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const item = itemOf(button);
    if ('done' in button.dataset) {
      const set = setOf(button);
      set.done = !set.done;
      if (set.done) confirmGhost(button);
    } else if ('addSet' in button.dataset) {
      item.sets.push(blankSet());
    } else if ('removeSet' in button.dataset) {
      item.sets.pop();
    } else if ('toggleNote' in button.dataset) {
      item.showNote = !item.showNote;
    } else {
      return;
    }
    draw();
  });

  $('#wk-save').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const performedOn = $('#wk-date').value;
    if (!performedOn) return toast('Podaj datę treningu.', 'error');
    let sets;
    try {
      sets = collectSets(items);
    } catch (error) {
      return toast(error.message, 'error');
    }
    button.disabled = true;
    try {
      const id = await api.saveWorkout({
        ...workout, id: existing?.workout.id, performed_on: performedOn, notes: $('#wk-notes').value.trim(),
      }, sets);
      toast('Trening zapisany', 'success');
      ctx.go(`/workout/${id}`);
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  });
}

// Zamienia stan formularza na serie do zapisu. Puste serie są pomijane.
function collectSets(items) {
  const sets = [];
  items.forEach((item, position) => {
    const kept = [];
    item.sets.forEach((set) => {
      const weight = toNumber(set.weight);
      const reps = set.reps.trim() === '' ? null : Number(set.reps.trim());
      const time = set.time.trim() === '' ? null : Number(set.time.trim());
      if (set.weight.trim() !== '' && (weight == null || weight < 0)) throw new Error(`${item.name}: niepoprawny ciężar.`);
      if (reps != null && (!Number.isInteger(reps) || reps < 0)) throw new Error(`${item.name}: liczba powtórzeń musi być liczbą całkowitą.`);
      if (time != null && (!Number.isInteger(time) || time < 0)) throw new Error(`${item.name}: czas podaj w pełnych sekundach.`);
      if (weight == null && reps == null && time == null && !set.done) return;
      kept.push({ weight, reps, duration_s: time, done: set.done });
    });
    const note = item.note.trim();
    if (!kept.length && note) kept.push({ weight: null, reps: null, duration_s: null, done: false });
    kept.forEach((set, n) => sets.push({
      position, label: item.label ?? '', exercise_name: item.name, exercise_id: item.exercise_id ?? null,
      set_number: n + 1, ...set, note: n === 0 ? note : '',
    }));
  });
  if (!sets.length) throw new Error('Wpisz lub zaznacz przynajmniej jedną serię.');
  return sets;
}

// ============================================================
// Podsumowanie treningu
// ============================================================

export async function viewWorkout(ctx, id) {
  const { me } = ctx;
  const data = await api.getWorkout(id);
  if (!data) return ctx.viewNotFound();
  const { workout, sets } = data;
  const isCoach = me.role === 'coach';

  const groups = [];
  for (const set of sets) {
    if (groups.at(-1)?.position !== set.position) groups.push({ position: set.position, name: set.exercise_name, label: set.label, note: '', sets: [] });
    const group = groups.at(-1);
    if (set.note) group.note = set.note;
    if (set.weight != null || set.reps != null || set.duration_s != null || set.done) group.sets.push(set);
  }
  const volume = volumeOf(sets);
  const setCount = sets.filter((s) => s.weight != null || s.reps != null || s.duration_s != null || s.done).length;

  ctx.renderShell({
    title: workout.day || 'Trening',
    back: isCoach ? `/client/${workout.client_id}?tab=workouts` : '/',
    nav: isCoach ? 'clients' : 'plans',
    body: html`
      <section class="card">
        <p class="muted small">${formatDate(workout.performed_on)}${workout.plan_name ? html` · ${workout.plan_name}` : ''}</p>
        <div class="wk-stats">
          <div><span class="stat">${groups.length}</span><span class="muted small">${plural(groups.length, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}</span></div>
          <div><span class="stat">${setCount}</span><span class="muted small">${plural(setCount, 'seria', 'serie', 'serii')}</span></div>
          ${volume ? html`<div><span class="stat">${formatNumber(volume, 0)}</span><span class="muted small">kg objętości</span></div>` : ''}
        </div>
        ${workout.notes ? html`<p class="pre-line">${workout.notes}</p>` : ''}
      </section>
      <ol class="card exercises">${groups.map((g) => html`
        <li>
          <div class="ex-row">
            ${g.label ? html`<span class="ex-label">${g.label}</span>` : ''}
            <span class="ex-text"><strong>${g.name}</strong>
              ${g.sets.length ? html`<span class="wk-sets">${g.sets.map((s) => html`<span class="${s.done ? '' : 'muted'}">${s.set_number}. ${formatSet(s)}</span>`)}</span>` : ''}
              ${g.note ? html`<span class="muted small">${g.note}</span>` : ''}
            </span>
          </div>
        </li>`)}
      </ol>
      <div class="row gap">
        <a class="btn grow" href="#/workout/${workout.id}/edit">${icons.edit} Edytuj</a>
        <button class="btn btn-outline danger" id="delete-workout">${icons.trash} Usuń</button>
      </div>
      ${workout.plan_id ? html`<a class="btn btn-outline btn-block" href="#/workout/new?plan=${workout.plan_id}&day=${encodeURIComponent(workout.day)}">${icons.play} Powtórz ten trening</a>` : ''}`,
  });

  $('#delete-workout').addEventListener('click', async () => {
    if (!confirm('Usunąć ten trening?')) return;
    await api.deleteWorkout(workout.id);
    toast('Trening usunięty');
    ctx.go(isCoach ? `/client/${workout.client_id}?tab=workouts` : '/');
  });
}

// Lista treningów (do karty podopiecznego i ekranu „Moje plany”).
export function workoutList(workouts, setsByWorkout) {
  return html`<ul class="list card">${workouts.map((w) => {
    const sets = setsByWorkout.get(w.id) ?? [];
    const exercises = new Set(sets.map((s) => s.position)).size;
    const volume = volumeOf(sets);
    return html`<li><a href="#/workout/${w.id}" class="list-item">
      <span class="wk-date-badge"><strong>${formatDate(w.performed_on).slice(0, 2)}</strong>${formatDate(w.performed_on).slice(3, 5)}</span>
      <span class="grow"><strong>${w.day || 'Trening'}</strong>${w.plan_name ? html` · ${w.plan_name}` : ''}<br>
        <span class="muted small">${exercises} ćw.${volume ? ` · ${formatNumber(volume, 0)} kg` : ''}</span></span>
      ${icons.chevron}
    </a></li>`;
  })}</ul>`;
}
