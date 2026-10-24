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

// kind: 'run' oznacza odcinek biegowy (dystans, czas, tempo, strefa).
const TARGET_FIELDS = ['reps', 'weight', 'time', 'effort', 'distance', 'pace', 'kind'];

export function blankTarget() {
  return { reps: '', weight: '', time: '', effort: '', distance: '', pace: '', kind: '' };
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
    ...blankTarget(),
    reps: seconds ? '' : reps,
    weight: weight.replace(/\s*kg$/i, ''),
    time: seconds ? seconds[1] : '',
  }));
}

// Ćwiczenie biegowe: odcinki z dystansem, czasem, tempem i strefą.
export function isRun(targets) {
  return targets.some((t) => t.kind === 'run' || t.distance.trim() || t.pace.trim());
}

export function isTimeBased(targets) {
  return !isRun(targets) && targets.some((t) => t.time.trim()) && !targets.some((t) => t.reps.trim());
}

// „8–10 powt. · 70%”, „45 s · 60%” albo dla biegu „400 m · 1:45 · 4:20/km · Z4”.
export function targetText(t) {
  if (t.kind === 'run' || t.distance.trim() || t.pace.trim()) {
    return [t.distance.trim(), t.time.trim(), t.pace.trim() && `${t.pace.trim()}/km`, t.effort.trim()].filter(Boolean).join(' · ');
  }
  const reps = t.reps.trim();
  return [reps && `${reps} powt.`, t.time.trim() && `${t.time.trim()} s`, t.effort.trim()].filter(Boolean).join(' · ');
}

// Jeśli wszystkie serie są takie same: „3 × 8–10 · 70%” (bieg: „6 × 400 m · Z4”), inaczej null.
export function targetsSummary(targets) {
  const key = (t) => [t.reps, t.time, t.effort, t.distance, t.pace].map((v) => v.trim()).join('|');
  if (!targets.length || targets.some((t) => key(t) !== key(targets[0]))) return null;
  const t = targets[0];
  if (isRun(targets)) {
    const text = targetText(t);
    return targets.length > 1 ? `${targets.length} × ${text || 'odcinek'}` : text || 'bieg';
  }
  const parts = [
    t.reps.trim() ? `${targets.length} × ${t.reps.trim()}` : `${targets.length} ${targets.length === 1 ? 'seria' : targets.length < 5 ? 'serie' : 'serii'}`,
    t.time.trim() && `${t.time.trim()} s`,
    t.effort.trim(),
  ];
  return parts.filter(Boolean).join(' · ');
}

// Czas biegu: „25:30” → 1530 s, „1:02:10” → 3730 s, „30” → 1800 s (same minuty).
export function parseClock(text) {
  const value = String(text ?? '').trim().replace(',', '.');
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * 60);
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return NaN;
  const [h, m, sec] = parts.length === 3 ? parts.map(Number) : [0, ...parts.map(Number)];
  if (m > 59 && parts.length === 3) return NaN;
  if (sec > 59) return NaN;
  return h * 3600 + m * 60 + sec;
}

// 1530 → „25:30”, 3730 → „1:02:10”
export function formatClock(seconds) {
  const s = Math.round(Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// Tempo na km: 1530 s na 5000 m → „5:06”.
export function formatPace(seconds, meters) {
  return seconds > 0 && meters > 0 ? formatClock(seconds / (meters / 1000)) : '';
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
