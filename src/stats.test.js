import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR_MS, DAY_MS, hourlyBuckets, composition, perNode, batterySeries,
  batteryLevel, nodeHealth, humanSince, withinWindow,
} from './stats.js';

const NOW = 1_700_000_000_000;

const alert = (over = {}) => ({
  nodeId: '0x01', label: 'CHAINSAW', isChainsaw: true, isVibration: false,
  isHeartbeat: false, confidence: 90, battery: 3.8, at: NOW, ...over,
});

const heartbeat = (over = {}) => alert({
  label: 'HEARTBEAT', isChainsaw: false, isVibration: false, isHeartbeat: true,
  confidence: null, ...over,
});

test('ember jam menaruh kejadian di jam yang benar', () => {
  const buckets = hourlyBuckets([
    alert({ at: NOW }),                          // jam berjalan
    alert({ at: NOW - 3 * HOUR_MS }),
    alert({ at: NOW - 3 * HOUR_MS, isChainsaw: false, isVibration: true }),
  ], NOW);

  assert.equal(buckets.length, 24);
  assert.equal(buckets[23].chainsaw, 1, 'ember terakhir = jam berjalan');
  assert.equal(buckets[20].chainsaw, 1);
  assert.equal(buckets[20].nature, 1);
});

test('kejadian di luar 24 jam tidak masuk grafik', () => {
  const buckets = hourlyBuckets([alert({ at: NOW - 30 * HOUR_MS }), alert({ at: NOW + HOUR_MS })], NOW);
  assert.equal(buckets.reduce((sum, b) => sum + b.chainsaw + b.nature, 0), 0);
});

test('komposisi menghitung tiga kategori', () => {
  const c = composition([
    alert(),
    alert({ isChainsaw: false, isVibration: true }),
    alert({ isChainsaw: false, isVibration: false }),
  ]);
  assert.deepEqual(c, { chainsaw: 1, vibration: 1, other: 1, total: 3 });
});

test('sebaran node diurutkan dari yang paling ramai', () => {
  const rows = perNode([
    alert({ nodeId: '0x02' }), alert({ nodeId: '0x01' }), alert({ nodeId: '0x01' }),
  ]);
  assert.deepEqual(rows, [{ nodeId: '0x01', count: 2 }, { nodeId: '0x02', count: 1 }]);
});

test('deret baterai melewati bacaan kosong, bukan menggantinya dengan nol', () => {
  const series = batterySeries([
    alert({ at: NOW - HOUR_MS, battery: 3.9 }),
    alert({ at: NOW, battery: null }),
    alert({ at: NOW - 2 * HOUR_MS, battery: 4.0 }),
  ]);
  assert.deepEqual(series.map((p) => p.volts), [4.0, 3.9], 'urut waktu, tanpa titik nol palsu');
});

test('level baterai mengikuti ambang 18650', () => {
  assert.equal(batteryLevel(3.9), 'normal');
  assert.equal(batteryLevel(3.5), 'low');
  assert.equal(batteryLevel(3.1), 'critical');
  assert.equal(batteryLevel(null), 'unknown');
});

test('kondisi node: menunggu, online, lalu senyap', () => {
  assert.deepEqual(nodeHealth([], NOW), { lastSeen: null, silentFor: null, status: 'waiting' });
  assert.equal(nodeHealth([alert({ at: NOW - 60_000 })], NOW).status, 'online');
  assert.equal(nodeHealth([alert({ at: NOW - 8 * HOUR_MS })], NOW).status, 'silent');
});

test('selisih waktu dibaca sebagai kalimat', () => {
  assert.equal(humanSince(null), 'belum ada kontak');
  assert.equal(humanSince(30_000), 'baru saja');
  assert.equal(humanSince(5 * 60_000), '5 menit lalu');
  assert.equal(humanSince(3 * HOUR_MS), '3 jam lalu');
  assert.equal(humanSince(2 * DAY_MS), '2 hari lalu');
});

test('jendela 24 jam memangkas riwayat lama', () => {
  const kept = withinWindow([alert({ at: NOW - 25 * HOUR_MS }), alert({ at: NOW - HOUR_MS })], NOW);
  assert.equal(kept.length, 1);
});

test('denyut tidak dihitung sebagai kejadian di mana pun', () => {
  const data = [alert(), heartbeat(), heartbeat({ at: NOW - HOUR_MS })];

  assert.equal(composition(data).total, 1, 'kartu kejadian 24 jam');
  assert.deepEqual(perNode(data), [{ nodeId: '0x01', count: 1 }], 'sebaran per node');
  assert.equal(
    hourlyBuckets(data, NOW).reduce((sum, b) => sum + b.chainsaw + b.nature, 0), 1,
    'grafik pola 24 jam',
  );
});

test('denyut tetap menyumbang bacaan baterai dan bukti node hidup', () => {
  const data = [heartbeat({ at: NOW - 60_000, battery: 3.71 })];
  assert.deepEqual(batterySeries(data).map((p) => p.volts), [3.71]);
  assert.equal(nodeHealth(data, NOW).status, 'online');
});

test('ambang senyap mengetat begitu node terbukti mengirim denyut', () => {
  const threeHours = 3 * HOUR_MS;

  // Tanpa denyut, diam tiga jam masih wajar: node memang hanya bicara saat ada kejadian.
  assert.equal(nodeHealth([alert({ at: NOW - threeHours })], NOW).status, 'online');

  // Dengan denyut yang pernah terlihat, diam tiga jam berarti denyutnya berhenti.
  assert.equal(nodeHealth([heartbeat({ at: NOW - threeHours })], NOW).status, 'silent');
});
