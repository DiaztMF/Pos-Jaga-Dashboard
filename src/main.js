import { initializeApp } from 'firebase/app';
import { getDatabase, ref, query, limitToLast, onChildAdded, onValue } from 'firebase/database';
import { normalizeAlert } from './alert.js';
import {
  createIcons, Activity, AlertTriangle, Axe, BatteryCharging,
  List, Radio, Settings, ShieldCheck, Trees, Volume2,
} from 'lucide';

createIcons({
  icons: { Activity, AlertTriangle, Axe, BatteryCharging, List, Radio, Settings, ShieldCheck, Trees, Volume2 },
});

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = 'voxsilva_firebase_config';
const MAX_ROWS = 50;          // baris log yang ditahan di DOM
const LIVE_WINDOW_MS = 60_000; // alert lebih tua dari ini dianggap riwayat, bukan kejadian live

/* ---------------------------------------------------------------- config */

function readConfig() {
  let override = null;
  try {
    override = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    localStorage.removeItem(STORAGE_KEY); // entri rusak, buang
  }
  return {
    databaseURL: override?.databaseURL || import.meta.env.VITE_FIREBASE_DATABASE_URL || '',
    apiKey: override?.apiKey || import.meta.env.VITE_FIREBASE_API_KEY || '',
    isOverride: Boolean(override?.databaseURL),
  };
}

/* ----------------------------------------------------------------- siren */

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

/* -------------------------------------------------------------- UI state */

let chainsawCount = 0;
let vibrationCount = 0;

function setConnection(state, text) {
  const styles = {
    ok: ['w-2 h-2 rounded-full bg-emerald-400', 'bg-emerald-950 text-emerald-300 border-emerald-800'],
    wait: ['w-2 h-2 rounded-full bg-amber-400 animate-pulse', 'bg-slate-800 text-slate-300 border-slate-700'],
    error: ['w-2 h-2 rounded-full bg-red-400', 'bg-red-950 text-red-300 border-red-800'],
  };
  const [dotClass, badgeClass] = styles[state];
  $('connection-dot').className = dotClass;
  $('connection-text').textContent = text;
  $('connection-badge').className =
    `flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${badgeClass}`;
}

function cell(text, className) {
  const td = document.createElement('td');
  td.className = `px-4 py-3 ${className}`;
  td.textContent = text;
  return td;
}

function renderRow(alert, timeStr) {
  const tr = document.createElement('tr');
  tr.className = alert.isChainsaw
    ? 'bg-red-950/20 hover:bg-red-900/30 transition'
    : alert.isVibration
      ? 'bg-amber-950/20 hover:bg-amber-900/30 transition'
      : 'hover:bg-slate-800/40 transition';

  const badge = document.createElement('span');
  badge.className = alert.isChainsaw
    ? 'px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-bold'
    : alert.isVibration
      ? 'px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-bold'
      : 'px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800';
  badge.textContent = alert.label;

  const typeCell = document.createElement('td');
  typeCell.className = 'px-4 py-3';
  typeCell.append(badge);

  tr.append(
    cell(timeStr, ''),
    cell(alert.nodeId, 'font-bold text-slate-200'),
    typeCell,
    cell(alert.confidence === null ? '—' : `${alert.confidence}%`, ''),
    cell(alert.battery === null ? '—' : `${alert.battery.toFixed(2)} V`, ''),
    cell(alert.isChainsaw ? 'Alert Sent' : 'Logged', 'text-slate-400'),
  );

  const tbody = $('table-log-body');
  $('table-placeholder')?.remove();
  tbody.prepend(tr);
  while (tbody.children.length > MAX_ROWS) tbody.lastElementChild.remove();
}

function raiseBanner(alert, timeStr) {
  const banner = $('banner-alert');
  banner.classList.remove('hidden');
  banner.classList.add('flex');
  $('banner-alert-desc').textContent =
    `Node ID: ${alert.nodeId} | Confidence: ${alert.confidence ?? '—'}% | Waktu: ${timeStr}`;
  siren.start();
}

function handleAlert(raw) {
  const alert = normalizeAlert(raw);
  const timeStr = new Date(alert.at).toLocaleTimeString('id-ID');
  const isLive = Date.now() - alert.at < LIVE_WINDOW_MS;

  if (alert.isChainsaw) $('count-chainsaw').textContent = ++chainsawCount;
  if (alert.isVibration) $('count-vibration').textContent = ++vibrationCount;
  if (alert.battery !== null) $('node-battery').textContent = `${alert.battery.toFixed(2)} V`;
  $('node-id-text').textContent = `Node ID: ${alert.nodeId}`;
  $('node-online-badge').textContent = 'ONLINE';
  $('node-online-badge').className =
    'px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800';

  renderRow(alert, timeStr);

  // ponytail: riwayat 20 alert terakhir ikut ter-replay saat halaman dibuka.
  // Hanya kejadian dalam LIVE_WINDOW_MS yang boleh membunyikan sirine.
  if (!isLive) return;

  if (alert.isChainsaw) {
    $('status-title').textContent = 'BAHAYA: GERGAJI MESIN!';
    $('status-title').className = 'text-xl font-extrabold text-red-400 mt-1';
    $('status-sub').textContent = 'Suara gergaji mesin terdeteksi di area node';
    $('card-status').className =
      'bg-red-950/40 border border-red-800 rounded-xl p-5 flex items-center justify-between transition-all';
    raiseBanner(alert, timeStr);
  } else if (alert.isVibration) {
    $('status-title').textContent = 'WARNING: GETARAN POHON';
    $('status-title').className = 'text-xl font-extrabold text-amber-400 mt-1';
    $('status-sub').textContent = 'Getaran abnormal terdeteksi sensor MPU6050';
    $('card-status').className =
      'bg-amber-950/40 border border-amber-800 rounded-xl p-5 flex items-center justify-between transition-all';
  }
}

/* -------------------------------------------------------------- firebase */

function connect({ databaseURL, apiKey }) {
  if (!databaseURL) {
    setConnection('error', 'Firebase belum dikonfigurasi');
    $('config-message').textContent = 'Isi Database URL di bawah, atau set VITE_FIREBASE_DATABASE_URL di .env.';
    return;
  }

  try {
    const app = initializeApp({ databaseURL, apiKey: apiKey || undefined });
    const db = getDatabase(app);

    onValue(ref(db, '.info/connected'), (snap) => {
      if (snap.val() === true) setConnection('ok', 'Firebase Connected');
      else setConnection('wait', 'Disconnected / Retrying...');
    });

    onChildAdded(
      query(ref(db, 'alerts'), limitToLast(20)),
      (snap) => { const v = snap.val(); if (v) handleAlert(v); },
      (err) => setConnection('error', `Gagal membaca /alerts: ${err.code}`),
    );
  } catch (err) {
    console.error('[VoxSilva] Firebase init gagal:', err);
    setConnection('error', 'Konfigurasi Firebase tidak valid');
  }
}

/* --------------------------------------------------------------- wire-up */

$('btn-toggle-audio').addEventListener('click', () => {
  if (siren.playing) return siren.stop();
  siren.start();
  setTimeout(() => siren.stop(), 3000); // tes 3 detik
});

$('btn-mute-alarm').addEventListener('click', () => {
  siren.stop();
  $('banner-alert').classList.add('hidden');
  $('banner-alert').classList.remove('flex');
});

$('form-config').addEventListener('submit', (e) => {
  e.preventDefault();
  const databaseURL = $('input-db-url').value.trim();
  const apiKey = $('input-api-key').value.trim();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ databaseURL, apiKey }));
  $('config-message').textContent = 'Tersimpan. Menghubungkan ulang...';
  location.reload();
});

$('btn-reset-config').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

// Simulasi alarm tanpa perangkat: jalankan __voxsilva.simulate('CHAINSAW') di
// console saat `npm run dev`. Hilang otomatis dari build production.
if (import.meta.env.DEV) {
  window.__voxsilva = {
    simulate: (type = 'CHAINSAW') => handleAlert({
      node_id: '0x01', alert_type: type, confidence: 97, battery: 3.74, timestamp: Date.now(),
    }),
  };
}

const config = readConfig();
$('input-db-url').value = config.databaseURL;
if (config.isOverride) $('config-message').textContent = 'Memakai override lokal (localStorage), bukan .env.';
connect(config);
