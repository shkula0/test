// Wspólne funkcje planów treningowych.

import { html } from './ui.js';

// Oznaczenia ćwiczeń w każdym dniu: pojedyncze A, B…, superserie C1, C2, C3.
// Ćwiczenie z superset = true wykonuje się razem z poprzednim (w tym samym dniu).
export function planLabels(exercises) {
  const groups = [];
  let letter = -1;
  exercises.forEach((ex, i) => {
    const prev = exercises[i - 1];
    const sameDay = prev && (prev.day || '') === (ex.day || '');
    if (!sameDay) letter = -1;
    if (ex.superset && sameDay) {
      groups.at(-1).items.push(i);
    } else {
      letter += 1;
      groups.push({ letter: letterFor(letter), items: [i] });
    }
  });
  const labels = [];
  for (const group of groups) {
    group.items.forEach((index, n) => {
      labels[index] = {
        label: group.items.length > 1 ? `${group.letter}${n + 1}` : group.letter,
        joined: n > 0,
        size: group.items.length,
        canJoin: index > 0 && (exercises[index - 1].day || '') === (exercises[index].day || ''),
      };
    });
  }
  return labels;
}

export function letterFor(n) {
  const char = (i) => String.fromCharCode(65 + i);
  return n < 26 ? char(n) : char(Math.floor(n / 26) - 1) + char(n % 26);
}

// Ciężar do wyświetlenia w planie – „0” / „0 kg” (ćwiczenie bez obciążenia) pomijamy.
export function planWeight(weight) {
  const text = (weight ?? '').trim();
  return /^0+([.,]0+)?\s*(kg)?$/i.test(text) ? '' : text;
}

// ============================================================
// Serie rozpisane w planie: każda seria ma powtórzenia, kg, czas i intensywność.
// ============================================================

const TARGET_FIELDS = ['reps', 'weight', 'time', 'effort'];

export function blankTarget() {
  return { reps: '', weight: '', time: '', effort: '' };
}

// Serie ćwiczenia z planu. Starsze plany (jedno pole „serie × powtórzenia”)
// zamieniamy na tyle samo jednakowych linijek; „45 s” traktujemy jako czas.
export function planTargets(ex) {
  if (Array.isArray(ex.set_targets) && ex.set_targets.length) {
    return ex.set_targets.map((t) => Object.fromEntries(TARGET_FIELDS.map((f) => [f, String(t?.[f] ?? '')])));
  }
  const count = Math.min(Math.max(Number.parseInt(ex.sets, 10) || 1, 1), 12);
  const reps = String(ex.reps ?? '').trim();
  const seconds = reps.match(/^(\d+)\s*(s|sek|sek\.|sekund)$/i);
  const weight = planWeight(String(ex.weight ?? ''));
  return Array.from({ length: count }, () => ({
    reps: seconds ? '' : reps,
    weight: weight.replace(/\s*kg$/i, ''),
    time: seconds ? seconds[1] : '',
    effort: '',
  }));
}

export function isTimeBased(targets) {
  return targets.some((t) => t.time.trim()) && !targets.some((t) => t.reps.trim());
}

// „8–10 powt. · 70%” albo „45 s · 60%” – plan nie zawiera ciężaru (wynika z progresu).
export function targetText(t) {
  const reps = t.reps.trim();
  return [reps && `${reps} powt.`, t.time.trim() && `${t.time.trim()} s`, t.effort.trim()].filter(Boolean).join(' · ');
}

// Jeśli wszystkie serie są takie same: „3 × 8–10 · 70%”, inaczej null.
export function targetsSummary(targets) {
  const key = (t) => [t.reps, t.time, t.effort].map((v) => v.trim()).join('|');
  if (!targets.length || targets.some((t) => key(t) !== key(targets[0]))) return null;
  const t = targets[0];
  const parts = [
    t.reps.trim() ? `${targets.length} × ${t.reps.trim()}` : `${targets.length} ${targets.length === 1 ? 'seria' : targets.length < 5 ? 'serie' : 'serii'}`,
    t.time.trim() && `${t.time.trim()} s`,
    t.effort.trim(),
  ];
  return parts.filter(Boolean).join(' · ');
}

export function cleanTargets(targets) {
  return targets.map((t) => Object.fromEntries(TARGET_FIELDS.map((f) => [f, String(t[f] ?? '').trim()])));
}

// ============================================================
// Bloki: EMOM, AMRAP, For Time, Tabata. Format zapisany przy pierwszym ćwiczeniu grupy
// (kolejne ćwiczenia dołączają tak jak w superserii).
// ============================================================

export const BLOCK_TYPES = { emom: 'EMOM', amrap: 'AMRAP', fortime: 'For Time', tabata: 'Tabata' };

export function defaultBlock(type) {
  return {
    emom: { type, minutes: 10 },
    amrap: { type, minutes: 12 },
    fortime: { type, rounds: 3, minutes: '' },
    tabata: { type, rounds: 8, work: 20, rest: 10 },
  }[type] ?? null;
}

const rundy = (n) => (n === 1 ? 'runda' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'rundy' : 'rund');

// Nagłówek bloku, np. „AMRAP 12 min – jak najwięcej rund”.
export function blockTitle(block) {
  if (!block?.type) return '';
  const n = (v, fallback) => Number(v) || fallback;
  switch (block.type) {
    case 'emom': return `EMOM ${n(block.minutes, 10)} min – na początku każdej minuty wykonaj zadanie, resztę minuty odpoczywasz`;
    case 'amrap': return `AMRAP ${n(block.minutes, 12)} min – jak najwięcej rund w tym czasie`;
    case 'fortime': {
      const rounds = n(block.rounds, 1);
      return `For Time – ${rounds} ${rundy(rounds)} jak najszybciej${Number(block.minutes) ? `, limit ${block.minutes} min` : ''}`;
    }
    case 'tabata': return `Tabata – ${n(block.rounds, 8)} × ${n(block.work, 20)} s pracy / ${n(block.rest, 10)} s przerwy`;
    default: return '';
  }
}

// Co wpisać jako wynik bloku w treningu.
export function blockResultLabel(block) {
  return {
    emom: 'Ukończone minuty',
    amrap: 'Wynik: rundy + powt.',
    fortime: 'Czas (mm:ss)',
    tabata: 'Wynik (np. suma powt.)',
  }[block?.type] ?? 'Wynik';
}

export function blockResultPlaceholder(block) {
  return { emom: 'np. 10', amrap: 'np. 5 + 7', fortime: 'np. 12:40', tabata: 'np. 96' }[block?.type] ?? '';
}

// Parametry bloku w edytorze (minuty, rundy, praca/przerwa).
export function blockParams(block) {
  if (!block) return '';
  const field = (key, label) => html`<label>${label}<input data-block-param="${key}" value="${block[key] ?? ''}" inputmode="numeric" autocomplete="off"></label>`;
  switch (block.type) {
    case 'emom':
    case 'amrap': return field('minutes', 'Czas (min)');
    case 'fortime': return html`${field('rounds', 'Rundy')}${field('minutes', 'Limit (min)')}`;
    case 'tabata': return html`${field('rounds', 'Rundy')}${field('work', 'Praca (s)')}${field('rest', 'Przerwa (s)')}`;
    default: return '';
  }
}
