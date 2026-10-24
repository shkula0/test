// Eksport wyników podopiecznego do PDF i Excela.
// Biblioteki (jsPDF, SheetJS) i czcionka ładują się dopiero przy pierwszym eksporcie.

import { api } from './data/index.js';
import { METRICS, metricSeries } from './measurements.js';
import { computeSummary, exerciseProgress, strengthEntries } from './summary.js';
import { formatDate, formatNumber, todayIso } from './ui.js';
import { formatSet } from './workouts.js';
import { blockTitle } from './plan-utils.js';

const scripts = new Map();

function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => {
        scripts.delete(src);
        reject(new Error('Nie udało się pobrać modułu eksportu – sprawdź internet.'));
      };
      document.head.append(el);
    }));
  }
  return scripts.get(src);
}

function slug(text) {
  return text.toLocaleLowerCase('pl').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'podopieczny';
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const signed = (n, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(n), digits)}`;
const withUnit = (value, unit) => (unit ? `${value} ${unit}` : `${value}`);

// ============================================================
// Dane raportu (wspólne dla PDF i Excela)
// ============================================================

async function reportData(clientId) {
  const [profile, workouts, workoutSets, lifts, metrics] = await Promise.all([
    api.getProfile(clientId), api.listWorkouts(clientId), api.listWorkoutSets(clientId),
    api.listLifts(clientId), api.listMetrics(clientId),
  ]);
  const strength = strengthEntries(lifts, workoutSets);
  const summary = computeSummary({ workouts, workoutSets, strength });
  const progress = exerciseProgress(strength);

  const measurements = METRICS.map((m) => {
    const series = metricSeries(metrics, m.key);
    if (!series.length) return null;
    const first = series[0];
    const last = series.at(-1);
    return { ...m, first, last, change: series.length > 1 ? last.value - first.value : null };
  }).filter(Boolean);

  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const sets = workoutSets
    .map((s) => ({ ...s, workout: workoutById.get(s.workout_id) }))
    .filter((s) => s.workout)
    .sort((a, b) => b.performed_on.localeCompare(a.performed_on)
      || (b.workout.created_at ?? '').localeCompare(a.workout.created_at ?? '')
      || a.position - b.position || a.set_number - b.set_number);

  return { profile, workouts, sets, lifts, metrics, summary, progress, measurements, generated: todayIso() };
}

function summaryRows({ summary }) {
  const p = summary.progress;
  return [
    ['Treningi (łącznie)', summary.totalWorkouts],
    ['Treningi w tym tygodniu', summary.week.workouts],
    ['Treningi w tym miesiącu', summary.month.workouts],
    ['Tonaż w tym tygodniu (kg)', Math.round(summary.week.tonnage)],
    ['Tonaż w poprzednim tygodniu (kg)', Math.round(summary.week.previous)],
    ['Tonaż w tym miesiącu (kg)', Math.round(summary.month.tonnage)],
    ['Tonaż w poprzednim miesiącu (kg)', Math.round(summary.month.previous)],
    ['Seria (tygodnie z rzędu z treningiem)', summary.streak],
    ['Rekordy z ostatnich 30 dni', summary.records],
    ['Największy progres', p ? `${p.exercise}: ${formatNumber(p.first.weight, 2)} → ${formatNumber(p.last.weight, 2)} kg (+${formatNumber(p.percent, 0)}%)` : '–'],
  ];
}

// ============================================================
// Excel
// ============================================================

export async function exportExcel(clientId) {
  const [data] = await Promise.all([reportData(clientId), loadScript('vendor/xlsx.mini.min.js')]);
  const XLSX = window.XLSX;
  const date = (iso) => (iso ? new Date(`${iso}T12:00:00`) : null);
  const num = (v) => (v == null || v === '' ? null : Number(v));
  const sheet = (rows, widths) => {
    const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: 'yyyy-mm-dd' });
    ws['!cols'] = widths.map((wch) => ({ wch }));
    return ws;
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([
    ['Raport postępów', data.profile?.full_name ?? ''],
    ['Wygenerowano', date(data.generated)],
    [],
    ['Parametr', 'Wartość'],
    ...summaryRows(data),
  ], [38, 50]), 'Podsumowanie');

  XLSX.utils.book_append_sheet(wb, sheet([
    ['Ćwiczenie', 'Start (kg)', 'Data startu', 'Ostatnio (kg)', 'Data', 'Zmiana (kg)', 'Zmiana (%)', 'Dni treningowe'],
    ...data.progress.map((r) => [
      r.exercise, r.first.weight, date(r.first.date), r.last.weight, date(r.last.date),
      r.sessions > 1 ? r.kg : null, r.sessions > 1 ? Math.round(r.percent * 10) / 10 : null, r.sessions,
    ]),
  ], [34, 11, 12, 13, 12, 12, 11, 14]), 'Progres');

  XLSX.utils.book_append_sheet(wb, sheet([
    ['Data', 'Plan', 'Dzień / trening', 'Oznaczenie', 'Ćwiczenie', 'Seria', 'Ciężar (kg)', 'Powtórzenia', 'Czas (s)', 'Dystans (km)', 'Zrobiona', 'Blok', 'Wynik bloku', 'Notatka'],
    ...data.sets.map((s) => [
      date(s.performed_on), s.workout.plan_name || 'bez planu', s.workout.day, s.label, s.exercise_name, s.set_number,
      num(s.weight), num(s.reps), num(s.duration_s), s.distance_m != null ? Number(s.distance_m) / 1000 : null, s.done ? 'tak' : 'nie',
      s.block?.type ? blockTitle(s.block).split(' – ')[0] : '', s.block_result ?? '', s.note,
    ]),
  ], [12, 24, 18, 11, 32, 7, 12, 12, 10, 12, 10, 18, 14, 30]), 'Treningi');

  const metricColumns = METRICS.filter((m) => !m.computed);
  const bmiByDate = new Map(metricSeries(data.metrics, 'bmi').map((p) => [p.date, p.value]));
  XLSX.utils.book_append_sheet(wb, sheet([
    ['Data', 'Źródło', ...metricColumns.map((m) => (m.unit ? `${m.label} (${m.unit})` : m.label)), 'BMI', 'Notatka'],
    ...data.metrics.map((row) => [
      date(row.measured_on), row.source === 'scale' ? 'waga (skład ciała)' : 'samodzielny',
      ...metricColumns.map((m) => num(row[m.key])),
      row.weight != null ? bmiByDate.get(row.measured_on) ?? null : null,
      row.note,
    ]),
  ], [12, 18, ...metricColumns.map(() => 16), 8, 30]), 'Pomiary');

  if (data.lifts.length) {
    XLSX.utils.book_append_sheet(wb, sheet([
      ['Data', 'Ćwiczenie', 'Ciężar (kg)', 'Powtórzenia', 'Notatka'],
      ...data.lifts.map((l) => [date(l.performed_on), l.exercise, num(l.weight), num(l.reps), l.note]),
    ], [12, 32, 12, 12, 30]), 'Wyniki dodane ręcznie');
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `postepy-${slug(data.profile?.full_name ?? '')}-${data.generated}.xlsx`);
}

// ============================================================
// PDF
// ============================================================

async function fontBase64(path) {
  const buffer = await (await fetch(path)).arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function exportPdf(clientId) {
  await loadScript('vendor/jspdf.umd.min.js');
  const [data, regular, bold] = await Promise.all([
    reportData(clientId),
    fontBase64('vendor/fonts/DejaVuSans.ttf'),
    fontBase64('vendor/fonts/DejaVuSans-Bold.ttf'),
    loadScript('vendor/jspdf.plugin.autotable.min.js'),
  ]);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  // DejaVu Sans ma polskie znaki (wbudowane czcionki PDF ich nie mają).
  doc.addFileToVFS('DejaVuSans.ttf', regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  doc.setFont('DejaVu', 'normal');

  const ACCENT = [232, 89, 12];
  const margin = 14;
  let y = 18;
  const table = (options) => {
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      styles: { font: 'DejaVu', fontSize: 9, cellPadding: 2 },
      headStyles: { font: 'DejaVu', fontStyle: 'bold', fillColor: ACCENT, textColor: 255 },
      alternateRowStyles: { fillColor: [253, 243, 236] },
      ...options,
    });
    y = doc.lastAutoTable.finalY + 8;
  };
  const heading = (text) => {
    if (y > 260) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('DejaVu', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...ACCENT);
    doc.text(text, margin, y);
    doc.setTextColor(0);
    y += 4;
  };

  doc.setFont('DejaVu', 'bold');
  doc.setFontSize(18);
  doc.text('Raport postępów', margin, y);
  y += 7;
  doc.setFont('DejaVu', 'normal');
  doc.setFontSize(11);
  doc.text(`${data.profile?.full_name ?? ''} · wygenerowano ${formatDate(data.generated)}`, margin, y);
  y += 9;

  heading('Podsumowanie');
  table({ head: [['Parametr', 'Wartość']], body: summaryRows(data).map(([k, v]) => [k, typeof v === 'number' ? formatNumber(v, 0) : v]) });

  heading('Progres w ćwiczeniach (najcięższa seria: start → ostatnio)');
  if (data.progress.length) {
    table({
      head: [['Ćwiczenie', 'Start', 'Ostatnio', 'Zmiana']],
      body: data.progress.map((r) => [
        r.exercise,
        `${formatNumber(r.first.weight, 2)} kg (${formatDate(r.first.date)})`,
        r.sessions > 1 ? `${formatNumber(r.last.weight, 2)} kg (${formatDate(r.last.date)})` : '–',
        r.sessions > 1 ? `${signed(r.percent, 0)}% (${signed(r.kg, 2)} kg)` : '1 trening',
      ]),
      columnStyles: { 3: { fontStyle: 'bold' } },
    });
  } else {
    doc.setFontSize(9);
    doc.text('Brak treningów z ciężarem.', margin, y + 2);
    y += 10;
  }

  heading('Pomiary ciała');
  if (data.measurements.length) {
    table({
      head: [['Parametr', 'Pierwszy pomiar', 'Ostatni pomiar', 'Zmiana']],
      body: data.measurements.map((m) => [
        m.label,
        `${withUnit(formatNumber(m.first.value), m.unit)} (${formatDate(m.first.date)})`,
        `${withUnit(formatNumber(m.last.value), m.unit)} (${formatDate(m.last.date)})`,
        m.change != null ? withUnit(signed(m.change), m.unit) : '–',
      ]),
    });
  } else {
    doc.setFontSize(9);
    doc.text('Brak pomiarów.', margin, y + 2);
    y += 10;
  }

  heading('Historia treningów');
  const groups = [];
  for (const s of data.sets) {
    const key = `${s.workout_id}|${s.position}`;
    if (groups.at(-1)?.key !== key) groups.push({ key, s, sets: [] });
    if (s.weight != null || s.reps != null || s.duration_s != null || s.distance_m != null || s.done) groups.at(-1).sets.push(s);
  }
  if (groups.length) {
    table({
      head: [['Data', 'Trening', 'Ćwiczenie', 'Serie']],
      body: groups.map(({ s, sets }) => [
        formatDate(s.performed_on),
        [s.workout.day, s.workout.plan_name].filter(Boolean).join(' · '),
        `${s.label ? `${s.label}. ` : ''}${s.exercise_name}`,
        [sets.map((x) => formatSet(x)).join(', '), s.block?.type ? `${blockTitle(s.block).split(' – ')[0]}, wynik: ${s.block_result || '–'}` : '']
          .filter(Boolean).join(' · ') || '–',
      ]),
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 38 }, 2: { cellWidth: 48 } },
    });
  } else {
    doc.setFontSize(9);
    doc.text('Brak zapisanych treningów.', margin, y + 2);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Strona ${i} z ${pages}`, 210 - margin, 290, { align: 'right' });
  }

  download(doc.output('blob'), `postepy-${slug(data.profile?.full_name ?? '')}-${data.generated}.pdf`);
}
