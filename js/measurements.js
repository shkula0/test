// Pomiary ciała: definicje, BMI liczone automatycznie, kafelki, wykres i formularze.

import { lineChart } from './chart.js';
import { icons } from './icons.js';
import { html, raw, formatNumber, todayIso, toNumber } from './ui.js';

// better: w którą stronę zmiana jest zwykle korzystna (do kolorowania), null = zależy od celu.
export const METRICS = [
  { key: 'weight', group: 'self', label: 'Masa ciała', unit: 'kg', freq: '1–3× w tygodniu', better: null },
  { key: 'height', group: 'self', label: 'Wzrost', unit: 'cm', freq: 'na początku', better: null },
  { key: 'bmi', group: 'self', label: 'BMI', unit: 'kg/m²', freq: 'liczone automatycznie', better: 'down', computed: true },
  { key: 'waist', group: 'self', label: 'Obwód talii', unit: 'cm', freq: 'co 2–4 tygodnie', better: 'down' },
  { key: 'hips', group: 'self', label: 'Obwód bioder', unit: 'cm', freq: 'co 2–4 tygodnie', better: null },
  { key: 'chest', group: 'self', label: 'Obwód klatki piersiowej', unit: 'cm', freq: 'co 4–6 tygodni', better: null },
  { key: 'arm', group: 'self', label: 'Obwód ramienia (biceps)', unit: 'cm', freq: 'co 4–6 tygodni', better: null },
  { key: 'forearm', group: 'self', label: 'Obwód przedramienia', unit: 'cm', freq: 'co 4–6 tygodni', better: null },
  { key: 'thigh', group: 'self', label: 'Obwód uda', unit: 'cm', freq: 'co 4–6 tygodni', better: null },
  { key: 'calf', group: 'self', label: 'Obwód łydki', unit: 'cm', freq: 'co 4–6 tygodni', better: null },
  { key: 'body_fat', group: 'scale', label: 'Tkanka tłuszczowa (PBF)', unit: '%', freq: 'co 4–8 tygodni', better: 'down' },
  { key: 'fat_mass', group: 'scale', label: 'Masa tkanki tłuszczowej (BFM)', unit: 'kg', freq: 'co 4–8 tygodni', better: 'down' },
  { key: 'muscle_mass', group: 'scale', label: 'Masa mięśni szkieletowych (SMM)', unit: 'kg', freq: 'co 4–8 tygodni', better: 'up' },
  { key: 'visceral_fat', group: 'scale', label: 'Poziom tłuszczu trzewnego', unit: '', freq: 'co 4–8 tygodni', better: 'down' },
  { key: 'body_water', group: 'scale', label: 'Całkowita woda w organizmie (TBW)', unit: 'l', freq: 'co 4–8 tygodni', better: null },
];

export const GROUPS = {
  self: { label: 'Samodzielne', add: 'Dodaj pomiar samodzielny' },
  scale: { label: 'Z wagi (skład ciała)', add: 'Dodaj wynik z wagi' },
};

const byKey = Object.fromEntries(METRICS.map((m) => [m.key, m]));
const INPUT_KEYS = METRICS.filter((m) => !m.computed).map((m) => m.key);

function withUnit(value, unit) {
  return unit ? `${value} ${unit}` : value;
}

// Seria punktów do wykresu. BMI liczone z wagi i ostatniego znanego wzrostu.
export function metricSeries(rows, key) {
  if (key !== 'bmi') {
    return rows.filter((r) => r[key] != null).map((r) => ({ date: r.measured_on, value: Number(r[key]) }));
  }
  const heights = rows.filter((r) => r.height != null);
  return rows.filter((r) => r.weight != null).flatMap((r) => {
    const height = [...heights].reverse().find((h) => h.measured_on <= r.measured_on) ?? heights[0];
    if (!height) return [];
    const meters = Number(height.height) / 100;
    return [{ date: r.measured_on, value: Math.round((Number(r.weight) / (meters * meters)) * 10) / 10 }];
  });
}

export function bodySection(rows, state) {
  const metrics = METRICS.filter((m) => m.group === state.group);
  const selected = byKey[state.metric]?.group === state.group ? byKey[state.metric] : metrics[0];
  const points = metricSeries(rows, selected.key);
  const hasHeight = rows.some((r) => r.height != null);

  const tile = (m) => {
    const series = metricSeries(rows, m.key);
    const last = series.at(-1);
    const change = series.length > 1 ? last.value - series[0].value : null;
    const tone = change && m.better ? ((change < 0) === (m.better === 'down') ? 'good' : 'bad') : '';
    return html`<button type="button" class="tile ${m.key === selected.key ? 'active' : ''}" data-metric="${m.key}">
      <span class="tile-label">${m.label}</span>
      <span class="tile-value">${last ? withUnit(formatNumber(last.value), m.unit) : '–'}</span>
      ${change != null && change !== 0 ? html`<span class="tile-delta ${tone}">${change > 0 ? '+' : ''}${formatNumber(change)}</span>` : ''}
      <span class="tile-freq">${m.freq}</span>
    </button>`;
  };

  return html`
    <section class="card">
      <h2>Pomiary ciała</h2>
      <div class="tabs tabs-small">${Object.entries(GROUPS).map(([key, g]) => html`
        <button type="button" class="${key === state.group ? 'active' : ''}" data-group="${key}">${g.label}</button>`)}
      </div>
      <div class="tiles">${metrics.map(tile)}</div>

      <h3 class="chart-title">${selected.label}${selected.unit ? html` <span class="muted">(${selected.unit})</span>` : ''}</h3>
      ${selected.key === 'bmi' && !hasHeight
        ? html`<p class="muted small">Wpisz raz wzrost w pomiarze samodzielnym, a BMI policzy się automatycznie.</p>`
        : html`<div class="chart-wrap">${raw(lineChart(points, { unit: selected.unit }))}</div>`}

      <details ${state.formOpen ? 'open' : ''}>
        <summary>${icons.plus} ${GROUPS[state.group].add}</summary>
        <form id="metric-form" class="stack" data-group="${state.group}" autocomplete="off">
          <label>Data<input type="date" name="measured_on" value="${todayIso()}" required></label>
          <div class="grid-2">
            ${metrics.filter((m) => !m.computed).map((m) => html`
              <label>${m.label}${m.unit ? ` (${m.unit})` : ''}
                <input name="${m.key}" inputmode="decimal" ${m.key === 'height' && hasHeight ? html`placeholder="już zapisany"` : ''}>
              </label>`)}
          </div>
          ${state.group === 'self' ? html`<p class="muted small">Wypełnij tylko to, co mierzysz – resztę zostaw pustą. Wzrost wystarczy podać raz.</p>`
            : html`<p class="muted small">Przepisz wyniki z wydruku lub aplikacji wagi (np. InBody, Tanita).</p>`}
          <label>Notatka<input name="note"></label>
          <button class="btn" type="submit">Zapisz</button>
        </form>
      </details>
    </section>`;
}

// Odczyt formularza pomiaru. Rzuca błąd, gdy nic nie wpisano lub wartość jest niepoprawna.
export function readMetricForm(data, group) {
  const metric = { measured_on: data.measured_on, note: (data.note ?? '').trim(), source: group };
  let filled = 0;
  for (const key of INPUT_KEYS) {
    if (byKey[key].group !== group) continue;
    const raw = data[key];
    if (raw == null || String(raw).trim() === '') continue;
    const value = toNumber(raw);
    if (value == null || value <= 0 || value >= 1000) throw new Error(`Niepoprawna wartość: ${byKey[key].label}.`);
    metric[key] = value;
    filled += 1;
  }
  if (!filled) throw new Error('Wpisz przynajmniej jedną wartość.');
  return metric;
}

// Opis wpisu do historii, np. „Masa ciała 72,4 kg · Obwód talii 80 cm”.
export function describeMetricRow(row) {
  return METRICS.filter((m) => !m.computed && row[m.key] != null)
    .map((m) => `${m.label} ${withUnit(formatNumber(row[m.key]), m.unit)}`)
    .join(' · ');
}

export function metricSourceLabel(row) {
  return row.source === 'scale' ? 'Waga (skład ciała)' : '';
}

