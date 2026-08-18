/**
 * Tiga grafik dashboard, dibangun di atas Chart.js yang sudah di-tree-shake.
 *
 * Warna tidak pernah ditulis sebagai literal di sini: semuanya dibaca ulang
 * dari CSS custom property setiap kali render, sehingga tombol mode malam
 * cukup memanggil render ulang tanpa ada tabel warna kedua yang harus dijaga.
 */

import {
  Chart, LineController, LineElement, PointElement, Filler,
  DoughnutController, ArcElement, LinearScale, CategoryScale, Tooltip,
} from 'chart.js';
import { BATTERY_CRITICAL, BATTERY_LOW } from './stats.js';
import { formatFull, formatShortTime } from './datetime.js';

Chart.register(
  LineController, LineElement, PointElement, Filler,
  DoughnutController, ArcElement, LinearScale, CategoryScale, Tooltip,
);

Chart.defaults.font.family = '"IBM Plex Sans Variable", ui-sans-serif, system-ui, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.animation.duration = 260;
// Plugin Legend sengaja tidak didaftarkan: legenda dibuat di HTML agar bisa ditata
// mengikuti token warna halaman, sekaligus memangkas ukuran bundle.

const instances = new Map();
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** Token warna selalu hex 6 digit, jadi dua digit alfa boleh ditempel langsung. */
const alpha = (hex, hexAlpha) => `${hex}${hexAlpha}`;

function mount(canvas, config) {
  const existing = instances.get(canvas.id);
  if (existing) existing.destroy();
  const chart = new Chart(canvas, config);
  instances.set(canvas.id, chart);
  return chart;
}

function baseScales() {
  const ink3 = token('--c-ink-3');
  const grid = token('--c-grid');
  return {
    x: {
      grid: { display: false },
      border: { color: grid },
      ticks: { color: ink3, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
    },
    y: {
      beginAtZero: true,
      grid: { color: grid },
      border: { display: false },
      ticks: { color: ink3, precision: 0, maxTicksLimit: 5 },
    },
  };
}

function tooltipStyle() {
  return {
    backgroundColor: token('--c-ink'),
    titleColor: token('--c-canvas'),
    bodyColor: token('--c-canvas'),
    padding: 10,
    cornerRadius: 6,
    displayColors: true,
    boxWidth: 8,
    boxHeight: 8,
    boxPadding: 4,
  };
}

/** Pola 24 jam: chainsaw (ancaman manusia) versus getaran alam.
 *  ponytail: tension 0 disengaja. Ini data cacah bilangan bulat, kurva halus
 *  akan menggambar "1,4 kejadian" di menit yang tidak pernah ada kejadiannya. */
export function renderHourly(canvas, buckets) {
  const critical = token('--c-critical');
  const warning = token('--c-warning');

  mount(canvas, {
    type: 'line',
    data: {
      labels: buckets.map((b) => new Date(b.hourStart).getHours().toString().padStart(2, '0')),
      datasets: [
        {
          label: 'Gergaji mesin',
          data: buckets.map((b) => b.chainsaw),
          borderColor: critical,
          backgroundColor: alpha(critical, '1f'),
          fill: true,
          tension: 0,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: critical,
          pointHoverBackgroundColor: critical,
        },
        {
          label: 'Getaran alam',
          data: buckets.map((b) => b.nature),
          borderColor: warning,
          backgroundColor: alpha(warning, '16'),
          fill: true,
          tension: 0,
          borderWidth: 2,
          borderDash: [4, 3],
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: warning,
          pointHoverBackgroundColor: warning,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: baseScales(),
      plugins: {
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            title: (items) => `Pukul ${items[0].label}:00`,
            label: (item) => ` ${item.dataset.label}: ${item.parsed.y} kejadian`,
          },
        },
      },
    },
  });
}

/** Komposisi kejadian 24 jam. */
export function renderComposition(canvas, comp) {
  mount(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Gergaji mesin', 'Getaran alam', 'Tak dikenali'],
      datasets: [{
        data: [comp.chainsaw, comp.vibration, comp.other],
        backgroundColor: [token('--c-critical'), token('--c-warning'), token('--c-ink-3')],
        borderColor: token('--c-surface'),
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            label: (item) => {
              const share = comp.total ? Math.round((item.parsed / comp.total) * 100) : 0;
              return ` ${item.label}: ${item.parsed} (${share}%)`;
            },
          },
        },
      },
    },
  });
}

/** Tren tegangan baterai dengan garis ambang kritis. */
export function renderBattery(canvas, series) {
  const accent = token('--c-accent');
  const critical = token('--c-critical');
  const scales = baseScales();

  mount(canvas, {
    type: 'line',
    data: {
      labels: series.map((p) => formatShortTime(p.at)),
      datasets: [
        {
          label: 'Tegangan',
          data: series.map((p) => p.volts),
          borderColor: accent,
          backgroundColor: alpha(accent, '18'),
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: `Ambang kritis ${BATTERY_CRITICAL} V`,
          data: series.map(() => BATTERY_CRITICAL),
          borderColor: critical,
          borderWidth: 1,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: scales.x,
        y: {
          ...scales.y,
          beginAtZero: false,
          suggestedMin: 3.0,
          suggestedMax: 4.3,
          ticks: { ...scales.y.ticks, precision: 2, callback: (v) => `${Number(v).toFixed(1)} V` },
        },
      },
      plugins: {
        tooltip: {
          ...tooltipStyle(),
          callbacks: {
            title: (items) => formatFull(series[items[0].dataIndex].at),
            label: (item) => ` ${item.dataset.label}: ${item.parsed.y.toFixed(2)} V`,
          },
        },
      },
    },
  });
}

export { BATTERY_LOW, BATTERY_CRITICAL };
