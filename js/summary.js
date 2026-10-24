// Podsumowanie i statystyki: tonaż tygodnia i miesiąca, liczba treningów,
// seria tygodni z treningiem, największy progres i rekordy.

import { icons } from './icons.js';
import { html, formatNumber, todayIso } from './ui.js';

// Wyniki siłowe z ręcznie dodanych rekordów i z serii zapisanych treningów.
export function strengthEntries(lifts, workoutSets) {
  return [
    ...lifts,
    ...workoutSets.filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0)
      .map((s) => ({ exercise: s.exercise_name, weight: Number(s.weight), reps: Number(s.reps), performed_on: s.performed_on })),
  ];
}

// Progres ciężaru w każdym ćwiczeniu: najcięższa seria z pierwszego treningu
// z tym ćwiczeniem vs najcięższa seria z ostatniego treningu.
export function exerciseProgress(strength) {
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

// ============================================================
// Daty (lokalne, format RRRR-MM-DD)
// ============================================================

function isoOf(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, days) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

// Poniedziałek tygodnia, w którym jest dana data.
function weekStart(iso) {
  const d = parseIso(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

function monthStart(iso) {
  return `${iso.slice(0, 8)}01`;
}

function previousMonthStart(iso) {
  const d = parseIso(monthStart(iso));
  d.setMonth(d.getMonth() - 1);
  return isoOf(d);
}

const inRange = (date, from, to) => date >= from && date < to;

// ============================================================
// Obliczenia
// ============================================================

export function computeSummary({ workouts, workoutSets, strength, completions = [], today = todayIso() }) {
  const thisWeek = weekStart(today);
  const nextWeek = addDays(thisWeek, 7);
  const lastWeek = addDays(thisWeek, -7);
  const thisMonth = monthStart(today);
  const lastMonth = previousMonthStart(today);

  const tonnage = (from, to) => workoutSets
    .filter((s) => inRange(s.performed_on, from, to))
    .reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
  const km = (from, to) => workoutSets
    .filter((s) => inRange(s.performed_on, from, to))
    .reduce((sum, s) => sum + (Number(s.distance_m) || 0), 0) / 1000;
  const count = (from, to) => workouts.filter((w) => inRange(w.performed_on, from, to)).length;

  // Seria: ile kolejnych tygodni (do bieżącego) miało przynajmniej jeden trening albo rutynę.
  // Bieżący tydzień bez treningu jeszcze nie przerywa serii.
  const weeksWithWorkout = new Set([
    ...workouts.map((w) => weekStart(w.performed_on)),
    ...completions.map((c) => weekStart(c.completed_on)),
  ]);
  const routines = (from, to) => completions.filter((c) => inRange(c.completed_on, from, to)).length;
  let streak = 0;
  let cursor = weeksWithWorkout.has(thisWeek) ? thisWeek : lastWeek;
  while (weeksWithWorkout.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }

  // Rekordy z 30 dni: dzień, w którym najcięższa seria w ćwiczeniu przebiła wszystkie wcześniejsze.
  const since = addDays(today, -29);
  const byExercise = new Map();
  for (const l of strength) {
    if (!byExercise.has(l.exercise)) byExercise.set(l.exercise, new Map());
    const days = byExercise.get(l.exercise);
    days.set(l.performed_on, Math.max(days.get(l.performed_on) ?? 0, Number(l.weight)));
  }
  let records = 0;
  for (const days of byExercise.values()) {
    let best = null;
    for (const date of [...days.keys()].sort()) {
      const weight = days.get(date);
      if (best != null && weight > best && date >= since) records += 1;
      best = Math.max(best ?? 0, weight);
    }
  }

  const progress = exerciseProgress(strength).find((r) => r.sessions > 1 && r.kg > 0) ?? null;

  return {
    week: { tonnage: tonnage(thisWeek, nextWeek), previous: tonnage(lastWeek, thisWeek), workouts: count(thisWeek, nextWeek), routines: routines(thisWeek, nextWeek), km: km(thisWeek, nextWeek) },
    month: { tonnage: tonnage(thisMonth, addDays(today, 1)), previous: tonnage(lastMonth, thisMonth), workouts: count(thisMonth, addDays(today, 1)), routines: routines(thisMonth, addDays(today, 1)), km: km(thisMonth, addDays(today, 1)) },
    streak,
    records,
    progress,
    totalWorkouts: workouts.length + completions.length,
  };
}

// ============================================================
// Widok
// ============================================================

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

function tonnageText(kg) {
  return kg >= 10000 ? `${formatNumber(kg / 1000, 1)} t` : `${formatNumber(kg, 0)} kg`;
}

// Bieżący tydzień/miesiąc jeszcze trwa, więc spadek pokazujemy neutralnie (szaro), a wzrost na zielono.
function change(current, previous) {
  if (!previous) return current ? { text: 'nowy wynik', tone: 'good' } : null;
  const percent = ((current - previous) / previous) * 100;
  const rounded = Math.round(percent);
  return {
    text: `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}%`,
    tone: rounded > 0 ? 'good' : '',
  };
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

export function summarySection(summary, { today = todayIso() } = {}) {
  const { week, month, streak, records, progress } = summary;
  const weekChange = change(week.tonnage, week.previous);
  const monthChange = change(month.tonnage, month.previous);
  const monthName = MONTHS[Number(today.slice(5, 7)) - 1];

  if (!summary.totalWorkouts) {
    return html`<section class="card summary">
      <h2>${icons.chart} Podsumowanie</h2>
      <p class="muted small">Tu pojawią się tonaż, liczba treningów i rekordy – wystarczy zapisać pierwszy trening z planu („Rozpocznij trening”).</p>
    </section>`;
  }

  return html`
    <section class="card summary">
      <h2>${icons.chart} Podsumowanie</h2>
      <div class="highlights">
        <div>
          <span class="hl-value ${progress ? 'good' : ''}">${progress ? `+${formatNumber(progress.percent, 0)}%` : '–'}</span>
          <span class="hl-label">Największy progres</span>
          <span class="hl-sub">${progress ? `${progress.exercise} (+${formatNumber(progress.kg, 2)} kg)` : 'po 2 treningach z ciężarem'}</span>
        </div>
        <div>
          <span class="hl-value ${weekChange?.tone ?? ''}">${weekChange ? weekChange.text : '–'}</span>
          <span class="hl-label">Tonaż</span>
          <span class="hl-sub">vs poprzedni tydzień</span>
        </div>
        <div>
          <span class="hl-value">${records}</span>
          <span class="hl-label">${plural(records, 'Rekord', 'Rekordy', 'Rekordów')}</span>
          <span class="hl-sub">z ostatnich 30 dni</span>
        </div>
      </div>
    </section>

    <div class="stat-grid">
      <section class="card stat-card">
        <span class="stat-title">Tonaż · ten tydzień</span>
        <span class="stat-big">${tonnageText(week.tonnage)}</span>
        <span class="stat-sub">poprzedni: ${tonnageText(week.previous)}${weekChange ? html` · <b class="${weekChange.tone}">${weekChange.text}</b>` : ''}</span>
      </section>
      <section class="card stat-card">
        <span class="stat-title">Tonaż · ${monthName}</span>
        <span class="stat-big">${tonnageText(month.tonnage)}</span>
        <span class="stat-sub">poprzedni miesiąc: ${tonnageText(month.previous)}${monthChange ? html` · <b class="${monthChange.tone}">${monthChange.text}</b>` : ''}</span>
      </section>
      <section class="card stat-card">
        <span class="stat-title">Treningi</span>
        <span class="stat-pair"><b>${week.workouts}</b> w tym tygodniu</span>
        <span class="stat-pair"><b>${month.workouts}</b> w tym miesiącu</span>
        ${month.routines ? html`<span class="stat-pair"><b>${month.routines}</b> ${plural(month.routines, 'rutyna', 'rutyny', 'rutyn')} w tym miesiącu</span>` : ''}
        ${month.km ? html`<span class="stat-pair"><b>${formatNumber(month.km, 1)} km</b> biegu w tym miesiącu${week.km ? ` (${formatNumber(week.km, 1)} km w tym tygodniu)` : ''}</span>` : ''}
      </section>
      <section class="card stat-card">
        <span class="stat-title">🔥 Seria</span>
        <span class="stat-big">${streak} ${plural(streak, 'tydzień', 'tygodnie', 'tygodni')}</span>
        <span class="stat-sub">z rzędu z co najmniej 1 treningiem lub rutyną</span>
      </section>
    </div>`;
}
