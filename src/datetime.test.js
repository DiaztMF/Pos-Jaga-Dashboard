import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOffset, formatDayLabel, isToday } from './datetime.js';

// Tanggal dibangun dari komponen lokal, bukan dari epoch mentah, supaya hasil
// tes tidak berubah saat dijalankan di zona waktu lain.
const at = (year, month, day, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

test('selisih hari dihitung per hari kalender, bukan per 24 jam', () => {
  const now = at(2026, 8, 18, 0, 1);      // baru lewat tengah malam
  const twoMinutesAgo = at(2026, 8, 17, 23, 59);

  assert.equal(now - twoMinutesAgo, 2 * 60_000, 'hanya berjarak dua menit');
  assert.equal(dayOffset(twoMinutesAgo, now), 1, 'tapi tetap hari yang berbeda');
});

test('jarak 23 jam dalam satu hari kalender tetap dianggap hari ini', () => {
  const now = at(2026, 8, 18, 23, 30);
  assert.equal(dayOffset(at(2026, 8, 18, 0, 30), now), 0);
  assert.equal(isToday(at(2026, 8, 18, 0, 30), now), true);
});

test('label hari: hari ini, kemarin, lalu jatuh ke tanggal', () => {
  const now = at(2026, 8, 18, 10, 0);
  assert.equal(formatDayLabel(at(2026, 8, 18, 4, 0), now), 'Hari ini');
  assert.equal(formatDayLabel(at(2026, 8, 17, 22, 0), now), 'Kemarin');
  assert.match(formatDayLabel(at(2026, 8, 15, 22, 0), now), /15 Agu 2026/);
});

test('stempel waktu di masa depan tidak menghasilkan label negatif', () => {
  const now = at(2026, 8, 18, 10, 0);
  assert.equal(formatDayLabel(at(2026, 8, 19, 1, 0), now), 'Besok');
});

test('pergantian bulan dan tahun tidak membuat perhitungan meleset', () => {
  assert.equal(dayOffset(at(2026, 7, 31, 23, 0), at(2026, 8, 1, 1, 0)), 1);
  assert.equal(dayOffset(at(2025, 12, 31, 23, 0), at(2026, 1, 1, 1, 0)), 1);
});
