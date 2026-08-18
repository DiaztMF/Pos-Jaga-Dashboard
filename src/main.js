import { initializeApp } from 'firebase/app';
import { getDatabase, ref, query, orderByChild, startAt, onChildAdded, onValue } from 'firebase/database';
import {
  createIcons, Activity, Axe, BatteryMedium, ChartLine, ChartPie, FlaskConical,
  List, Moon, RadioTower, Settings, ShieldCheck, Siren, Sun, Trees, TriangleAlert, Volume2,
} from 'lucide';

import { normalizeAlert } from './alert.js';
import {
  DAY_MS, batteryLevel, batterySeries, composition, hourlyBuckets,
  humanSince, nodeHealth, perNode, withinWindow,
} from './stats.js';
import { renderBattery, renderComposition, renderHourly } from './charts.js';
import {
  formatCompactDate, formatDayLabel, formatFull, formatHeaderDate, formatShortTime,
  formatTime, isToday,
} from './datetime.js';
import { generateDemoAlerts } from './demo.js';

const ICONS = {
  Activity, Axe, BatteryMedium, ChartLine, ChartPie, FlaskConical, List, Moon,
  RadioTower, Settings, ShieldCheck, Siren, Sun, Trees, TriangleAlert, Volume2,
};

const $ = (id) => document.getElementById(id);

const THEME_KEY = 'voxsilva_theme';
const LIVE_WINDOW_MS = 60_000; // kejadian lebih tua dari ini adalah riwayat, bukan alarm

/* ------------------------------------------------------------------- state */

let alerts = [];          // sudah ternormalisasi, dipangkas ke jendela 24 jam
let demoMode = false;
let logFilter = 'all';
let alarmActive = false;

/* -------------------------------------------------------------------- tema */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('btn-theme').innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}" class="h-4 w-4"></i>`;
  $('btn-theme').setAttribute('aria-label', theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap');
  createIcons({ icons: ICONS, root: $('btn-theme') });
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', getComputedStyle(document.documentElement).getPropertyValue('--c-canvas').trim(),
  );
}

/* ------------------------------------------------------------------ sirine */

const siren = {
  ctx: null,
  osc: null,
  timer: null,
  get playing() { return this.osc !== null; },

  start() {
    if (this.playing) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      this.osc = osc;

      let high = true;
      this.timer = setInterval(() => {
        osc.frequency.linearRampToValueAtTime(high ? 1200 : 600, this.ctx.currentTime + 0.4);
        high = !high;
      }, 500);
    } catch (err) {
      console.warn('[VoxSilva] Web Audio tidak tersedia:', err);
    }
  },

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (!this.osc) return;
    try { this.osc.stop(); this.osc.disconnect(); } catch { /* sudah berhenti */ }
    this.osc = null;
  },
};

/* -------------------------------------------------------------- pita status */

const RIBBON_STYLES = {
  normal: {
    box: 'border-normal/30 bg-normal-soft',
    icon: 'bg-normal/15 text-normal',
    title: 'text-normal',
    glyph: 'shield-check',
  },
  warning: {
    box: 'border-warning/40 bg-warning-soft',
    icon: 'bg-warning/15 text-warning',
    title: 'text-warning',
    glyph: 'activity',
  },
  critical: {
    box: 'border-critical/50 alarm-live',
    icon: 'bg-critical/20 text-critical',
    title: 'text-critical',
    glyph: 'siren',
  },
};

function setRibbon(level, title, sub) {
  const style = RIBBON_STYLES[level];
  $('status-ribbon').className =
    `flex flex-col gap-3 rounded-[10px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${style.box}`;
  $('ribbon-icon').className = `grid h-11 w-11 shrink-0 place-items-center rounded-full ${style.icon}`;
  $('ribbon-icon').innerHTML = `<i data-lucide="${style.glyph}" class="h-6 w-6"></i>`;
  $('ribbon-title').className = `text-lg font-semibold ${style.title}`;
  $('ribbon-title').textContent = title;
  $('ribbon-sub').textContent = sub;
  $('btn-mute').hidden = level !== 'critical';
  createIcons({ icons: ICONS, root: $('ribbon-icon') });
}

/* ------------------------------------------------------------------ render */

/** Canvas disembunyikan saat kosong: Chart.js tidak boleh menggambar sumbu
 *  palsu di atas data yang belum ada. Mengembalikan true bila layak digambar.
 *  Placeholder [data-empty] bersifat opsional, panel boleh dipasang tanpa itu. */
function chartArea(canvasId, isEmpty) {
  const canvas = $(canvasId);
  if (!canvas) return false;
  canvas.style.display = isEmpty ? 'none' : '';
  const placeholder = document.querySelector(`[data-empty="${canvasId}"]`);
  if (placeholder) placeholder.hidden = !isEmpty;
  return !isEmpty;
}

function render() {
  const now = Date.now();
  alerts = withinWindow(alerts, now);

  const comp = composition(alerts);
  const health = nodeHealth(alerts, now);
  const battery = batterySeries(alerts);
  const lastBattery = battery.at(-1)?.volts ?? null;

  renderMetrics(comp, health, lastBattery, now);
  renderCharts(comp, battery, now);
  renderDistribution();
  renderLog();
  if (!alarmActive) renderCalmRibbon(comp, health, now);
}

function renderMetrics(comp, health, lastBattery, now) {
  $('kpi-total').textContent = comp.total;
  $('kpi-chainsaw').textContent = comp.chainsaw;
  $('kpi-nature').textContent = comp.vibration;

  if (alarmActive) {
    $('kpi-status').textContent = 'Bahaya';
    $('kpi-status').className = 'mt-2 text-2xl font-semibold text-critical';
    $('kpi-status-sub').textContent = 'Gergaji mesin terdeteksi, alarm aktif';
  } else if (comp.chainsaw > 0) {
    $('kpi-status').textContent = 'Waspada';
    $('kpi-status').className = 'mt-2 text-2xl font-semibold text-warning';
    $('kpi-status-sub').textContent = `${comp.chainsaw} deteksi gergaji dalam 24 jam terakhir`;
  } else {
    $('kpi-status').textContent = 'Aman';
    $('kpi-status').className = 'mt-2 text-2xl font-semibold text-normal';
    $('kpi-status-sub').textContent = comp.total
      ? `${comp.total} kejadian tercatat, tidak ada gergaji mesin`
      : 'Belum ada kejadian tercatat';
  }

  const [batteryTone, batteryNote] = {
    critical: ['text-critical', 'Kritis, node perlu didatangi'],
    low: ['text-warning', 'Mulai lemah, siapkan penggantian'],
    normal: ['text-ink', 'Normal'],
    unknown: ['text-ink', 'Menunggu bacaan pertama'],
  }[batteryLevel(lastBattery)];

  $('kpi-battery').textContent = lastBattery === null ? '--' : `${lastBattery.toFixed(2)} V`;
  $('kpi-battery').className = `tnum mt-2 text-2xl font-semibold ${batteryTone}`;
  $('kpi-battery-sub').textContent = batteryNote;

  if (health.lastSeen === null) {
    $('kpi-lastseen').textContent = '--';
    $('kpi-lastseen').removeAttribute('title');
    $('kpi-lastseen-sub').textContent = 'Node mengirim hanya saat ada kejadian';
  } else {
    const sameDay = isToday(health.lastSeen, now);
    $('kpi-lastseen').textContent = sameDay
      ? formatShortTime(health.lastSeen)
      : `${formatShortTime(health.lastSeen)}, ${formatDayLabel(health.lastSeen, now)}`;
    $('kpi-lastseen').title = formatFull(health.lastSeen);
    $('kpi-lastseen-sub').textContent =
      `${humanSince(now - health.lastSeen)}${health.status === 'silent' ? ', node senyap lama' : ''}`;
  }
}

function renderCharts(comp, battery, now) {
  if (chartArea('chart-hourly', alerts.length === 0)) {
    renderHourly($('chart-hourly'), hourlyBuckets(alerts, now));
  }
  $('composition-center').hidden = comp.total === 0;
  $('composition-total').textContent = comp.total;
  if (chartArea('chart-composition', comp.total === 0)) {
    renderComposition($('chart-composition'), comp);
  }
  if (chartArea('chart-battery', battery.length < 2)) {
    renderBattery($('chart-battery'), battery);
  }
}

function renderDistribution() {
  const rows = perNode(alerts);
  const list = $('node-distribution');
  list.replaceChildren();

  if (rows.length === 0) {
    const li = document.createElement('li');
    li.className = 'text-ink-3';
    li.textContent = 'Menunggu data node.';
    list.append(li);
    return;
  }

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  for (const row of rows) {
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between gap-3';

    const name = document.createElement('span');
    name.className = 'font-mono text-xs text-ink-2';
    name.textContent = `Node ${row.nodeId}`;

    const value = document.createElement('span');
    value.className = 'tnum text-xs text-ink-3';
    value.textContent = `${row.count} kejadian (${Math.round((row.count / total) * 100)}%)`;

    li.append(name, value);
    list.append(li);
  }
}

function renderLog() {
  const now = Date.now();
  const body = $('log-body');
  const visible = alerts
    .filter((a) => (logFilter === 'chainsaw' ? a.isChainsaw : logFilter === 'nature' ? a.isVibration : true))
    .sort((a, b) => b.at - a.at)
    .slice(0, 100);

  body.replaceChildren();
  $('log-empty').hidden = visible.length > 0;

  for (const alert of visible) {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-sunk';

    const badge = document.createElement('span');
    badge.className = alert.isChainsaw
      ? 'inline-flex items-center whitespace-nowrap rounded-full bg-critical-soft px-2 py-0.5 text-xs font-semibold text-critical'
      : alert.isVibration
        ? 'inline-flex items-center whitespace-nowrap rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning'
        : 'inline-flex items-center whitespace-nowrap rounded-full bg-sunk px-2 py-0.5 text-xs font-semibold text-ink-2';
    badge.textContent = alert.isChainsaw ? 'Gergaji mesin' : alert.isVibration ? 'Getaran alam' : alert.label;

    const badgeCell = document.createElement('td');
    badgeCell.className = 'px-5 py-2.5';
    badgeCell.append(badge);

    tr.append(
      timeCell(alert.at, now),
      cell(alert.nodeId, 'px-5 py-2.5 font-mono text-xs'),
      badgeCell,
      cell(alert.confidence === null ? '--' : `${alert.confidence}%`, 'tnum px-5 py-2.5 text-right'),
      cell(alert.battery === null ? '--' : `${alert.battery.toFixed(2)} V`, 'tnum px-5 py-2.5 text-right text-ink-2'),
    );
    body.append(tr);
  }
}

/** Log memuat jendela 24 jam, jadi selalu melewati tengah malam: jam saja tidak
 *  cukup. Tanggal hanya dimunculkan untuk baris yang bukan hari ini, dan waktu
 *  lengkapnya selalu tersedia sebagai tooltip. */
function timeCell(at, now) {
  const td = document.createElement('td');
  td.className = 'whitespace-nowrap px-5 py-2.5 text-ink-2';
  td.title = formatFull(at);

  const time = document.createElement('span');
  time.className = 'tnum';
  time.textContent = formatTime(at);
  td.append(time);

  if (!isToday(at, now)) {
    const day = document.createElement('span');
    day.className = 'mt-0.5 block text-[11px] text-ink-3';
    day.textContent = formatDayLabel(at, now);
    td.append(day);
  }
  return td;
}

function cell(text, className) {
  const td = document.createElement('td');
  td.className = `whitespace-nowrap ${className}`;
  td.textContent = text;
  return td;
}

function renderCalmRibbon(comp, health, now) {
  const recentVibration = alerts.some((a) => a.isVibration && now - a.at < 15 * 60_000);

  if (recentVibration) {
    setRibbon('warning', 'Getaran terdeteksi',
      'Sensor MPU6050 mencatat getaran dalam 15 menit terakhir. Belum ada suara gergaji mesin.');
  } else if (health.status === 'silent') {
    setRibbon('normal', 'Hutan aman',
      `Tidak ada ancaman aktif. Kontak terakhir ${humanSince(now - health.lastSeen)}.`);
  } else {
    setRibbon('normal', 'Hutan aman', comp.total
      ? `Tidak ada ancaman aktif. ${comp.total} kejadian tercatat dalam 24 jam.`
      : 'Tidak ada ancaman aktif. Menunggu data dari node hutan.');
  }
}

/* ----------------------------------------------------------- alur kejadian */

function ingest(raw, { live }) {
  const alert = normalizeAlert(raw);
  if (Date.now() - alert.at > DAY_MS) return;

  // Kejadian sungguhan selalu menang atas mode demo: data contoh dibuang lebih
  // dulu supaya petugas tidak melihat alarm nyata bercampur angka karangan.
  if (live && demoMode) exitDemoMode();

  alerts.push(alert);
  if (live && alert.isChainsaw && Date.now() - alert.at < LIVE_WINDOW_MS) raiseAlarm(alert);
  render();
}

function raiseAlarm(alert) {
  alarmActive = true;
  setRibbon('critical', 'Gergaji mesin terdeteksi',
    `Node ${alert.nodeId}, keyakinan ${alert.confidence ?? '--'}%, ${formatFull(alert.at)}`);
  siren.start();
}

function clearAlarm() {
  alarmActive = false;
  siren.stop();
  render();
}

/* --------------------------------------------------------------- mode demo */

function enterDemoMode() {
  demoMode = true;
  alerts = generateDemoAlerts(Date.now()).map((raw) => normalizeAlert(raw));
  $('demo-banner').hidden = false;
  $('btn-demo').setAttribute('aria-pressed', 'true');
  $('btn-demo').classList.add('bg-warning-soft', 'text-warning');
  render();
}

function exitDemoMode() {
  demoMode = false;
  alerts = [];
  $('demo-banner').hidden = true;
  $('btn-demo').setAttribute('aria-pressed', 'false');
  $('btn-demo').classList.remove('bg-warning-soft', 'text-warning');
  render();
}

/* ---------------------------------------------------------------- firebase */

/** Konfigurasi hanya berasal dari .env dan ikut ter-inline saat build. Tidak ada
 *  jalur kedua lewat localStorage: satu build, satu tujuan database. */
function readConfig() {
  return {
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || '',
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  };
}

function setConnection(state, text) {
  $('connection-dot').className =
    `h-2 w-2 rounded-full ${{ ok: 'bg-normal', wait: 'bg-warning', error: 'bg-critical' }[state]}`;
  $('connection-text').textContent = text;
}

function connect({ databaseURL, apiKey }) {
  if (!databaseURL) {
    setConnection('error', 'Belum dikonfigurasi');
    console.error('[VoxSilva] VITE_FIREBASE_DATABASE_URL kosong. Isi .env lalu build ulang.');
    return;
  }

  try {
    const db = getDatabase(initializeApp({ databaseURL, apiKey: apiKey || undefined }));

    onValue(ref(db, '.info/connected'), (snap) => {
      setConnection(snap.val() === true ? 'ok' : 'wait', snap.val() === true ? 'Terhubung' : 'Menyambung ulang');
    });

    // Riwayat 24 jam sekaligus aliran kejadian baru. `startAt` di atas
    // orderByChild('timestamp') membutuhkan .indexOn di database.rules.json.
    const window24h = query(ref(db, 'alerts'), orderByChild('timestamp'), startAt(Date.now() - DAY_MS));
    let historyLoaded = false;

    onChildAdded(
      window24h,
      (snap) => { const value = snap.val(); if (value) ingest(value, { live: historyLoaded }); },
      (err) => setConnection('error', `Gagal membaca: ${err.code}`),
    );

    // onChildAdded memutar ulang riwayat lebih dulu. Firebase mengirim event
    // 'value' setelah seluruh riwayat awal terkirim, jadi apa pun sesudah itu
    // adalah kejadian baru yang boleh membunyikan sirine.
    onValue(window24h, () => { historyLoaded = true; }, { onlyOnce: true });
  } catch (err) {
    console.error('[VoxSilva] Firebase gagal dimulai:', err);
    setConnection('error', 'Konfigurasi tidak valid');
  }
}

/* ----------------------------------------------------------------- wire-up */

applyTheme(localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light');
createIcons({ icons: ICONS });

$('btn-theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  render(); // grafik membaca ulang token warna dari CSS saat digambar ulang
});

$('btn-demo').addEventListener('click', () => (demoMode ? exitDemoMode() : enterDemoMode()));

$('btn-audio').addEventListener('click', () => {
  if (siren.playing) return siren.stop();
  siren.start();
  setTimeout(() => siren.stop(), 3000); // tes 3 detik
});

$('btn-mute').addEventListener('click', clearAlarm);

$('log-filter').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  logFilter = button.dataset.filter;
  for (const item of $('log-filter').children) {
    const active = item.dataset.filter === logFilter;
    item.className = `rounded px-2.5 py-1 font-medium ${active ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2'}`;
  }
  renderLog();
});
$('log-filter').firstElementChild.click(); // pasang gaya awal tombol "Semua"

const tickClock = () => {
  const now = Date.now();
  $('clock-date-long').textContent = formatHeaderDate(now);
  $('clock-date-short').textContent = formatCompactDate(now);
  $('clock-time').textContent = formatTime(now);
};
tickClock();
setInterval(tickClock, 1000);
setInterval(render, 60_000); // "kontak terakhir" menua, riwayat lewat 24 jam dipangkas

// Simulasi tanpa perangkat, hanya saat `npm run dev`. Hilang dari build production.
if (import.meta.env.DEV) {
  window.__voxsilva = {
    simulate: (type = 'CHAINSAW') => ingest({
      node_id: '0x01', alert_type: type, confidence: 97, battery: 3.74, timestamp: Date.now(),
    }, { live: true }),
    demo: enterDemoMode,
  };
}

render();
connect(readConfig());
