import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAlert } from './alert.js';

const NOW = 1_700_000_000_000;

test('payload normal dari pos_jaga.ino', () => {
  const a = normalizeAlert({
    node_id: '0x01', alert_type: 'CHAINSAW', alert_code: '0xAA',
    confidence: 99, battery: 3.8, timestamp: NOW,
  }, NOW);
  assert.deepEqual(a, {
    nodeId: '0x01', label: 'CHAINSAW', isChainsaw: true, isVibration: false,
    isHeartbeat: false, confidence: 99, battery: 3.8, at: NOW,
  });
});

test('alert dikenali dari alert_code saat alert_type kosong', () => {
  assert.equal(normalizeAlert({ alert_code: '0xBB' }, NOW).isVibration, true);
  assert.equal(normalizeAlert({ alert_code: '0xaa' }, NOW).isChainsaw, true);
});

test('field rusak atau hilang tidak meledak dan tidak jadi NaN', () => {
  for (const raw of [null, {}, { confidence: 'x', battery: null, timestamp: 'abad' }]) {
    const a = normalizeAlert(raw, NOW);
    assert.equal(a.confidence, null);
    assert.equal(a.battery, null);
    assert.equal(a.at, NOW, 'timestamp tak valid harus jatuh ke waktu sekarang');
    assert.equal(a.label, 'ALERT');
  }
});

test('nilai liar dijepit agar tidak merusak tampilan', () => {
  const a = normalizeAlert({
    node_id: 'x'.repeat(500), alert_type: 'y'.repeat(500), confidence: 5000,
  }, NOW);
  assert.equal(a.nodeId.length, 12);
  assert.equal(a.label.length, 20);
  assert.equal(a.confidence, 100);
  assert.equal(normalizeAlert({ confidence: -20 }, NOW).confidence, 0);
});

test('denyut berkala dikenali dan tidak tertukar dengan alarm', () => {
  const beat = normalizeAlert({
    node_id: '0x01', alert_type: 'HEARTBEAT', alert_code: '0xCC',
    confidence: 0, battery: 3.8, timestamp: NOW,
  }, NOW);
  assert.equal(beat.isHeartbeat, true);
  assert.equal(beat.isChainsaw, false);
  assert.equal(beat.isVibration, false);

  // Gateway lama yang belum mengenal HEARTBEAT tetap meneruskan kodenya.
  assert.equal(normalizeAlert({ alert_code: '0xcc' }, NOW).isHeartbeat, true);
});
