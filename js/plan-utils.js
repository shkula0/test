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
