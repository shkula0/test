// Wspólne funkcje planów treningowych.

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

const withKg = (weight) => (/^[\d.,]+$/.test(weight) ? `${weight} kg` : weight);

// „10 × 80 kg · 45 s · 60%”
export function targetText(t) {
  const reps = t.reps.trim();
  const weight = planWeight(t.weight);
  const main = reps && weight ? `${reps} × ${withKg(weight)}` : reps ? `${reps} powt.` : weight ? withKg(weight) : '';
  return [main, t.time.trim() && `${t.time.trim()} s`, t.effort.trim()].filter(Boolean).join(' · ');
}

// Jeśli wszystkie serie są takie same: „3 × 10 · 80 kg · 60%”, inaczej null.
export function targetsSummary(targets) {
  const key = (t) => TARGET_FIELDS.map((f) => t[f].trim()).join('|');
  if (!targets.length || targets.some((t) => key(t) !== key(targets[0]))) return null;
  const t = targets[0];
  const parts = [
    t.reps.trim() ? `${targets.length} × ${t.reps.trim()}` : `${targets.length} ${targets.length === 1 ? 'seria' : targets.length < 5 ? 'serie' : 'serii'}`,
    withKg(planWeight(t.weight)),
    t.time.trim() && `${t.time.trim()} s`,
    t.effort.trim(),
  ];
  return parts.filter(Boolean).join(' · ');
}

export function cleanTargets(targets) {
  return targets.map((t) => Object.fromEntries(TARGET_FIELDS.map((f) => [f, String(t[f] ?? '').trim()])));
}
