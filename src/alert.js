/**
 * Payload alert datang dari ESP32 Pos Jaga lewat REST API — perangkat lapangan
 * dengan baterai lemah, sinyal LoRa cacat, dan siapa pun yang tahu URL database
 * bisa menulis ke sana. Semua field diperlakukan sebagai input tidak tepercaya.
 */

/** Number(null) dan Number('') sama-sama 0 — angka palsu itu lebih berbahaya
 *  daripada tanda strip, jadi field kosong harus jadi null, bukan nol. */
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeAlert(raw, now = Date.now()) {
  const type = String(raw?.alert_type ?? '').toUpperCase();
  const code = String(raw?.alert_code ?? '').toLowerCase();
  const confidence = toNumber(raw?.confidence);
  const battery = toNumber(raw?.battery);
  const timestamp = toNumber(raw?.timestamp);

  return {
    nodeId: String(raw?.node_id ?? '—').slice(0, 12),
    label: type.slice(0, 20) || 'ALERT',
    isChainsaw: type === 'CHAINSAW' || code === '0xaa',
    isVibration: type === 'VIBRATION' || code === '0xbb',
    confidence: confidence === null ? null : Math.max(0, Math.min(100, confidence)),
    battery,
    at: timestamp !== null && timestamp > 0 ? timestamp : now,
  };
}
