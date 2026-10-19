// Prosty wykres liniowy w SVG – bez zewnętrznych bibliotek, działa offline.

import { formatDate, formatNumber } from './ui.js';

const WIDTH = 340;
const HEIGHT = 180;
const PAD = { top: 16, right: 14, bottom: 28, left: 40 };

export function lineChart(points, { unit = '' } = {}) {
  if (points.length === 0) {
    return '<p class="muted chart-empty">Brak danych do wykresu.</p>';
  }

  const xs = points.map((p) => Date.parse(p.date));
  const ys = points.map((p) => p.value);
  let [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  let [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  if (minX === maxX) {
    minX -= 86400000;
    maxX += 86400000;
  }
  const spread = maxY - minY || Math.max(1, Math.abs(maxY) * 0.05);
  minY -= spread * 0.15;
  maxY += spread * 0.15;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const sx = (x) => PAD.left + ((x - minX) / (maxX - minX)) * innerW;
  const sy = (y) => PAD.top + (1 - (y - minY) / (maxY - minY)) * innerH;

  const coords = points.map((p, i) => [sx(xs[i]), sy(p.value)]);
  const path = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${path}L${coords.at(-1)[0].toFixed(1)},${PAD.top + innerH}L${coords[0][0].toFixed(1)},${PAD.top + innerH}Z`;

  const ticks = [0, 0.5, 1].map((t) => minY + (maxY - minY) * t);
  const grid = ticks.map((t) => {
    const y = sy(t).toFixed(1);
    return `<line x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${y}" y2="${y}" class="chart-grid"/>
      <text x="${PAD.left - 6}" y="${y}" class="chart-label" text-anchor="end" dominant-baseline="middle">${formatNumber(t)}</text>`;
  }).join('');

  const first = points[0];
  const last = points.at(-1);
  const xLabels = `
    <text x="${PAD.left}" y="${HEIGHT - 8}" class="chart-label">${formatDate(first.date)}</text>
    <text x="${WIDTH - PAD.right}" y="${HEIGHT - 8}" class="chart-label" text-anchor="end">${formatDate(last.date)}</text>`;

  const dots = coords.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" class="chart-dot">
      <title>${formatDate(points[i].date)}: ${formatNumber(points[i].value)} ${unit}</title></circle>`).join('');

  return `<svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img"
      aria-label="Wykres: od ${formatNumber(first.value)} do ${formatNumber(last.value)} ${unit}">
    ${grid}
    <path d="${area}" class="chart-area"/>
    <path d="${path}" class="chart-line"/>
    ${dots}
    ${xLabels}
  </svg>`;
}
