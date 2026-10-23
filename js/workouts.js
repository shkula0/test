// Dziennik treningów: rozpoczęcie treningu z planu, wpisywanie serii z podglądem
// poprzedniego treningu, podsumowanie i historia.

import { api } from './data/index.js';
import { icons } from './icons.js';
import { normalize, resolveExercise } from './library.js';
import { exerciseThumb } from './media.js';
import {
  BLOCK_TYPES, blockParams, blockResultLabel, blockResultPlaceholder, blockTitle, defaultBlock, isTimeBased, letterFor,
  planLabels, planTargets, targetText,
} from './plan-utils.js';
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

export const FREE_WORKOUT = 'Trening dowolny';

export async function viewWorkoutEditor(ctx, { workoutId, planId, day, clientId }) {
  const { me } = ctx;
  const existing = workoutId ? await api.getWorkout(workoutId) : null;
  if (workoutId && !existing) return ctx.viewNotFound();

  const planRef = existing ? existing.workout.plan_id : planId;
  const planData = planRef ? await api.getPlan(planRef).catch(() => null) : null;
  if (!existing && planId && !planData) return ctx.viewNotFound();

  // Trening dowolny: bez planu, ćwiczenia dodaje się w trakcie.
  const free = !planRef && !(existing?.workout.plan_name);
  const workout = existing?.workout ?? (planData ? {
    client_id: planData.plan.client_id,
    plan_id: planData.plan.id,
    plan_name: planData.plan.name,
    day: day ?? '',
    performed_on: todayIso(),
    notes: '',
  } : {
    client_id: clientId ?? me.id,
    plan_id: null,
    plan_name: '',
    day: FREE_WORKOUT,
    performed_on: todayIso(),
    notes: '',
  });
  const [library, allSets] = await Promise.all([api.listExercises(), api.listWorkoutSets(workout.client_id)]);
  // „Poprzednio”: najpierw ten sam plan i dzień, a jeśli tam ćwiczenia nie było – ostatni dowolny trening z nim.
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
          block: null, blockResult: '',
        });
      }
      const item = byPosition.get(set.position);
      if (set.note) item.note = set.note;
      if (set.block?.type) item.block = set.block;
      if (set.block_result) item.blockResult = set.block_result;
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
        sets: Array.from({ length: count }, blankSet), block: ex.block?.type ? ex.block : null, blockResult: '',
      };
    });
  }

  // Ustawienia zależne od planu i historii; wywoływane też dla ćwiczeń dodanych w trakcie.
  const prepare = (item) => {
    item.showNote = Boolean(item.note);
    const plan = planByName.get(normalize(item.name));
    item.targets = plan ? planTargets(plan) : [];
    const prev = previous.get(normalize(item.name));
    // Ćwiczenie na czas (np. plank): zamiast powtórzeń wpisujemy sekundy.
    item.timeMode = item.targets.length
      ? isTimeBased(item.targets)
      : Boolean(prev?.sets.some((x) => x.duration_s != null) && !prev.sets.some((x) => x.reps != null))
        || item.sets.some((x) => x.time !== '' && x.reps === '');
  };
  items.forEach(prepare);
  // Blok (EMOM/AMRAP/…) obejmuje pierwsze ćwiczenie grupy i dołączone do niego; w bloku jedno zadanie na rundę.
  const assignBlocks = () => {
    // Oznaczenia A, B1, B2… liczone na nowo (po dodaniu, usunięciu lub połączeniu ćwiczeń).
    const labels = planLabels(items.map((item) => ({ day: '', superset: item.joined })));
    items.forEach((item, i) => {
      item.label = labels[i].label;
    });
    let current = null;
    items.forEach((item) => {
      if (!item.joined) current = item.block ?? null;
      item.groupBlock = current;
      if (current && item.sets.length > 1) item.sets = item.sets.slice(0, 1);
    });
  };
  assignBlocks();

  // Szare podpowiedzi w polach: wyłącznie wynik z poprzedniego treningu (przy pierwszym treningu – puste).
  const ghostOf = (item, n) => {
    const prev = previous.get(normalize(item.name));
    const before = prev?.sets[n] ?? prev?.sets.at(-1);
    return {
      weight: before && Number(before.weight) > 0 ? Number(before.weight) : null,
      reps: before?.reps ?? null,
      time: before?.duration_s ?? null,
    };
  };
  const previousBlockResult = (item) => previous.get(normalize(item.name))?.sets.find((x) => x.block_result)?.block_result ?? '';

  const backTo = existing ? `/workout/${existing.workout.id}`
    : planData ? `/plan/${workout.plan_id}`
      : me.role === 'coach' ? `/client/${workout.client_id}?tab=workouts` : '/';
  ctx.renderShell({
    title: existing ? 'Edytuj trening' : free ? FREE_WORKOUT : 'Trening',
    back: backTo,
    nav: me.role === 'coach' ? 'clients' : 'plans',
    body: html`
      <section class="card wk-top">
        <div class="grow">
          ${free
            ? html`<label>Nazwa treningu<input id="wk-title" value="${workout.day}" autocomplete="off" placeholder="np. Funkcjonalny – obwód"></label>`
            : html`<strong>${workout.plan_name}</strong>${workout.day ? html` · ${workout.day}` : ''}`}
          <p class="muted small"><span class="ghost-sample">Szare liczby</span> to ostatni wynik w danym ćwiczeniu (przy pierwszym razie pola są puste).
            Bez zmian? Stuknij numer serii, żeby ją odhaczyć. Progres? Najpierw wpisz nowy wynik.</p>
        </div>
        <label class="wk-date">Data<input type="date" id="wk-date" value="${workout.performed_on}" required></label>
      </section>
      <div id="wk-items" class="stack"></div>
      <section class="card wk-add">
        <label>Dodaj ćwiczenie
          <input id="wk-add-name" list="wk-add-list" autocomplete="off" placeholder="Zacznij pisać, np. Przysiad…">
        </label>
        <datalist id="wk-add-list">${library.map((e) => html`<option value="${e.name}">`)}</datalist>
        <button type="button" class="btn btn-outline" id="wk-add">${icons.plus} Dodaj</button>
      </section>
      <section class="card">
        <label>Notatka do treningu<textarea id="wk-notes" rows="2" placeholder="Samopoczucie, uwagi…">${workout.notes}</textarea></label>
      </section>
      <div class="sticky-actions"><button class="btn btn-block" id="wk-save">${icons.check} Zapisz trening</button></div>`,
  });

  const container = $('#wk-items');
  // Ćwiczenia spoza planu (trening dowolny lub dodane w trakcie): łączenie w superserię i formaty bloków.
  const structureControls = (item, i, plan) => {
    if (plan) return '';
    const prevBlock = i > 0 ? items[i - 1].groupBlock : null;
    return html`
      ${i > 0 ? html`<label class="superset-toggle">
        <input type="checkbox" data-join ${item.joined ? 'checked' : ''}>
        <span>${prevBlock ? `W bloku ${BLOCK_TYPES[prevBlock.type]} z poprzednim ćwiczeniem` : 'Superseria z poprzednim ćwiczeniem'}</span>
      </label>` : ''}
      ${!item.joined ? html`<div class="block-edit">
        <label>Format
          <select data-wk-block-type>
            <option value="">Serie (standard)</option>
            ${Object.entries(BLOCK_TYPES).map(([key, label]) => html`<option value="${key}" ${item.block?.type === key ? 'selected' : ''}>${label}</option>`)}
          </select>
        </label>
        ${blockParams(item.block)}
      </div>` : ''}`;
  };
  const exerciseHead = (item, i, plan, prev, info) => html`
    ${structureControls(item, i, plan)}
    <div class="wk-head">
      <span class="ex-label">${item.label || i + 1}</span>
      <div class="grow">
        <strong>${item.name}</strong>
        ${plan?.rest && !item.groupBlock ? html`<br><span class="muted small">Przerwa: ${plan.rest}</span>` : ''}
        ${plan?.notes ? html`<br><span class="muted small">${plan.notes}</span>` : ''}
        ${prev ? html`<br><span class="muted small">Poprzednio: ${formatDate(prev.date)}</span>` : ''}
      </div>
      ${info ? html`<a href="#/exercise/${info.id}" target="_blank" class="wk-thumb" aria-label="Jak wykonać">${exerciseThumb(info, { animate: true })}</a>` : ''}
      ${!plan ? html`<button type="button" class="icon-btn danger" data-remove-item aria-label="Usuń ćwiczenie z treningu">${icons.trash}</button>` : ''}
    </div>`;

  const draw = () => {
    container.innerHTML = items.length ? html`${items.map((item, i) => {
      const info = resolveExercise(library, { id: item.exercise_id, name: item.name });
      const plan = planByName.get(normalize(item.name));
      const prev = previous.get(normalize(item.name));
      const next = items[i + 1];
      const inSuperset = item.joined || next?.joined;
      const amountKey = item.timeMode ? 'time' : 'reps';

      // Ćwiczenie w bloku: jedno zadanie na rundę, wynik całego bloku przy pierwszym ćwiczeniu.
      if (item.groupBlock) {
        const set = item.sets[0];
        const ghost = ghostOf(item, 0);
        const lastResult = !item.joined ? previousBlockResult(item) : '';
        return html`
          <section class="card wk-ex in-superset ${item.joined ? 'joined' : ''} ${set.done ? 'block-done' : ''}" data-item="${i}">
            ${!item.joined ? html`<p class="superset-head">${icons.link} ${blockTitle(item.groupBlock)}</p>` : ''}
            ${exerciseHead(item, i, plan, prev, info)}
            <table class="sets block-sets" data-set="0">
              <thead><tr><th>Zadanie</th><th>kg</th><th>${item.timeMode ? 'Czas (s)' : 'Powt.'}</th></tr></thead>
              <tbody><tr class="${set.done ? 'done' : ''}" data-set="0">
                <td class="set-target">${item.targets[0] ? targetText(item.targets[0]) || '–' : '–'}</td>
                <td><input data-k="weight" value="${set.weight}" inputmode="decimal" autocomplete="off" aria-label="Ciężar"
                  placeholder="${ghost.weight != null ? formatNumber(ghost.weight, 2) : ''}"></td>
                <td><input data-k="${amountKey}" value="${set[amountKey]}" inputmode="numeric" autocomplete="off" aria-label="${item.timeMode ? 'Czas' : 'Powtórzenia'}"
                  placeholder="${ghost[amountKey] ?? ''}"></td>
              </tr></tbody>
            </table>
            ${!item.joined ? html`<div class="block-result">
              <label>${blockResultLabel(item.groupBlock)}
                <input data-block-result value="${item.blockResult}" autocomplete="off"
                  placeholder="${lastResult ? `ostatnio: ${lastResult}` : blockResultPlaceholder(item.groupBlock)}"></label>
              <button type="button" class="btn ${set.done ? '' : 'btn-outline'}" data-block-done aria-pressed="${set.done}">
                ${icons.check} ${set.done ? 'Blok zrobiony' : 'Zrobione'}</button>
            </div>` : ''}
            <div class="wk-actions">
              <button type="button" class="chip ${item.showNote ? 'active' : ''}" data-toggle-note>${icons.edit} Notatka</button>
            </div>
            ${item.showNote ? html`<textarea data-note rows="2" placeholder="Uwagi do ćwiczenia (technika, odczucia)…">${item.note}</textarea>` : ''}
          </section>`;
      }

      return html`
        <section class="card wk-ex ${inSuperset ? 'in-superset' : ''} ${item.joined ? 'joined' : ''}" data-item="${i}">
          ${inSuperset && !item.joined ? html`<p class="superset-head">${icons.link} Superseria – jedno po drugim</p>` : ''}
          ${exerciseHead(item, i, plan, prev, info)}
          <table class="sets">
            <thead><tr><th>Seria</th><th>Plan</th><th>kg</th><th>${item.timeMode ? 'Czas (s)' : 'Powt.'}</th></tr></thead>
            <tbody>${item.sets.map((set, n) => {
              const target = item.targets[n];
              const ghost = ghostOf(item, n);
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
            ${!plan ? html`<label class="chip chip-check ${item.timeMode ? 'active' : ''}"><input type="checkbox" data-time-mode ${item.timeMode ? 'checked' : ''}> Na czas (s)</label>` : ''}
          </div>
          ${item.showNote ? html`<textarea data-note rows="2" placeholder="Uwagi do ćwiczenia (technika, odczucia)…">${item.note}</textarea>` : ''}
        </section>`;
    })}` : ctx.emptyState(free ? 'Dodaj pierwsze ćwiczenie poniżej.' : 'Ten dzień planu nie ma ćwiczeń.');
  };
  draw();

  const itemOf = (el) => items[Number(el.closest('[data-item]').dataset.item)];
  const setOf = (el) => itemOf(el).sets[Number(el.closest('[data-set]').dataset.set)];
  // Odhaczenie zatwierdza szare wartości w pustych polach; wpisane ręcznie zostają.
  const confirmGhost = (item, n) => {
    const set = item.sets[n];
    const ghost = ghostOf(item, n);
    if (set.weight === '' && ghost.weight != null) set.weight = inputNumber(ghost.weight);
    const amountKey = item.timeMode ? 'time' : 'reps';
    if (set[amountKey] === '' && ghost[amountKey] != null) set[amountKey] = String(ghost[amountKey]);
  };

  container.addEventListener('input', (event) => {
    const { k } = event.target.dataset;
    if (k) setOf(event.target)[k] = event.target.value;
    if ('note' in event.target.dataset) itemOf(event.target).note = event.target.value;
    if ('blockResult' in event.target.dataset) itemOf(event.target).blockResult = event.target.value;
  });

  container.addEventListener('change', (event) => {
    const item = itemOf(event.target);
    const { dataset } = event.target;
    if ('timeMode' in dataset) {
      item.timeMode = event.target.checked;
    } else if ('join' in dataset) {
      item.joined = event.target.checked;
      if (item.joined) item.block = null;
      assignBlocks();
    } else if ('wkBlockType' in dataset) {
      item.block = defaultBlock(event.target.value);
      assignBlocks();
    } else if (dataset.blockParam) {
      item.block[dataset.blockParam] = event.target.value.trim();
      assignBlocks();
    } else {
      return;
    }
    draw();
  });

  container.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const index = Number(button.closest('[data-item]').dataset.item);
    const item = items[index];
    if ('done' in button.dataset) {
      const set = setOf(button);
      set.done = !set.done;
      if (set.done) confirmGhost(item, Number(button.closest('[data-set]').dataset.set));
    } else if ('blockDone' in button.dataset) {
      // Cały blok: lider i dołączone ćwiczenia.
      const done = !item.sets[0].done;
      for (let k = index; k < items.length && (k === index || items[k].joined); k += 1) {
        items[k].sets[0].done = done;
        if (done) confirmGhost(items[k], 0);
      }
    } else if ('addSet' in button.dataset) {
      item.sets.push(blankSet());
    } else if ('removeSet' in button.dataset) {
      item.sets.pop();
    } else if ('toggleNote' in button.dataset) {
      item.showNote = !item.showNote;
    } else if ('removeItem' in button.dataset) {
      if (item.sets.some((x) => x.weight || x.reps || x.time) && !confirm(`Usunąć „${item.name}” z tego treningu?`)) return;
      const [removed] = items.splice(index, 1);
      // Usunięto pierwsze ćwiczenie grupy – następne dołączone przejmuje jego rolę (i format bloku).
      if (!removed.joined && items[index]?.joined) Object.assign(items[index], { joined: false, block: removed.block });
      assignBlocks();
    } else {
      return;
    }
    draw();
  });

  // Dodawanie ćwiczenia w trakcie treningu (trening dowolny albo coś spoza planu).
  const addExercise = () => {
    const input = $('#wk-add-name');
    const name = input.value.trim();
    if (!name) return input.focus();
    const lib = library.find((e) => normalize(e.name) === normalize(name));
    const prev = previous.get(normalize(name));
    const groups = items.filter((x) => !x.joined).length;
    const item = {
      name: lib?.name ?? name, exercise_id: lib?.id ?? null, label: letterFor(groups), joined: false, note: '',
      sets: Array.from({ length: Math.min(prev?.sets.length || 3, MAX_SETS) }, blankSet), block: null, blockResult: '',
    };
    prepare(item);
    items.push(item);
    assignBlocks();
    input.value = '';
    draw();
    container.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  $('#wk-add').addEventListener('click', addExercise);
  $('#wk-add-name').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addExercise();
    }
  });

  $('#wk-save').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const performedOn = $('#wk-date').value;
    if (!performedOn) return toast('Podaj datę treningu.', 'error');
    const title = free ? ($('#wk-title').value.trim() || FREE_WORKOUT) : workout.day;
    let sets;
    try {
      sets = collectSets(items);
    } catch (error) {
      return toast(error.message, 'error');
    }
    button.disabled = true;
    try {
      const id = await api.saveWorkout({
        ...workout, id: existing?.workout.id, day: title, performed_on: performedOn, notes: $('#wk-notes').value.trim(),
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
    const blockResult = (item.blockResult ?? '').trim();
    const isLeader = item.groupBlock && !item.joined;
    if (!kept.length && (note || (isLeader && blockResult))) kept.push({ weight: null, reps: null, duration_s: null, done: false });
    kept.forEach((set, n) => sets.push({
      position, label: item.label ?? '', exercise_name: item.name, exercise_id: item.exercise_id ?? null,
      set_number: n + 1, ...set, note: n === 0 ? note : '',
      // Pola bloku tylko przy pierwszym ćwiczeniu bloku (bez bloków zapis działa też przed migracją 008).
      ...(isLeader && n === 0 ? { block: item.groupBlock, block_result: blockResult } : {}),
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
    if (groups.at(-1)?.position !== set.position) {
      groups.push({ position: set.position, name: set.exercise_name, label: set.label, note: '', sets: [], block: null, result: '' });
    }
    const group = groups.at(-1);
    if (set.note) group.note = set.note;
    if (set.block?.type) group.block = set.block;
    if (set.block_result) group.result = set.block_result;
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
        ${g.block ? html`<li class="superset block block-summary">
          <p class="superset-head">${icons.link} ${blockTitle(g.block)}</p>
          <p class="block-score">${blockResultLabel(g.block)}: <strong>${g.result || '–'}</strong></p>
        </li>` : ''}
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
      ${workout.plan_id ? html`<a class="btn btn-outline btn-block" href="#/workout/new?plan=${workout.plan_id}&day=${encodeURIComponent(workout.day)}">${icons.play} Powtórz ten trening</a>` : ''}
      ${!workout.plan_id && !workout.plan_name ? html`<a class="btn btn-outline btn-block" href="#/workout/new?client=${workout.client_id}">${icons.plus} Nowy ${FREE_WORKOUT.toLowerCase()}</a>` : ''}`,
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
