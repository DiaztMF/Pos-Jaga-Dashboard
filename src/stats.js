/**
 * Turunan statistik dari aliran alert. Semua fungsi di sini murni: tidak
 * menyentuh DOM, tidak menyentuh Firebase, tidak memakai Date.now() sendiri.
 * `now` selalu dioper masuk supaya perilakunya bisa diuji dan tidak berubah
 * hanya karena jam dinding bergerak.
 *
 * Masukan selalu berupa array alert yang sudah lewat normalizeAlert().
 */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** ponytail: ambang baterai untuk pack 18650 Li-ion di node hutan.
 *  Ganti angka ini kalau pack diganti (LiFePO4 punya kurva yang jauh berbeda). */
export const BATTERY_LOW = 3.6;
export const BATTERY_CRITICAL = 3.3;

/** Node tanpa denyut hanya bicara saat ada kejadian, jadi diamnya tidak berarti
 *  rusak. Ambangnya longgar supaya tidak menakut-nakuti petugas tanpa alasan. */
export const SILENT_AFTER_MS = 6 * HOUR_MS;

/** Begitu node mengirim denyut berkala (0xCC tiap 30 menit), diam berubah makna:
 *  tiga denyut terlewat berarti node benar-benar tidak sehat. */
export const SILENT_AFTER_HEARTBEAT_MS = 95 * 60_000;

/** Denyut adalah telemetri, bukan kejadian. Ia tidak boleh masuk hitungan alarm,
 *  grafik pola, maupun riwayat, karena akan menenggelamkan kejadian sungguhan. */
export const incidents = (alerts) => alerts.filter((a) => !a.isHeartbeat);

/** 24 ember per jam, ember terakhir adalah jam yang sedang berjalan. */
export function hourlyBuckets(allAlerts, now) {
  const alerts = incidents(allAlerts);
  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const buckets = Array.from({ length: 24 }, (_, i) => ({
    hourStart: currentHour - (23 - i) * HOUR_MS,
    chainsaw: 0,
    nature: 0,
  }));

  for (const alert of alerts) {
    const index = 23 - Math.floor((currentHour - Math.floor(alert.at / HOUR_MS) * HOUR_MS) / HOUR_MS);
    if (index < 0 || index > 23) continue;
    if (alert.isChainsaw) buckets[index].chainsaw += 1;
    else if (alert.isVibration) buckets[index].nature += 1;
  }
  return buckets;
}

export function composition(allAlerts) {
  const alerts = incidents(allAlerts);
  const out = { chainsaw: 0, vibration: 0, other: 0, total: alerts.length };
  for (const alert of alerts) {
    if (alert.isChainsaw) out.chainsaw += 1;
    else if (alert.isVibration) out.vibration += 1;
    else out.other += 1;
  }
  return out;
}

/** Sebaran kejadian per node, terbanyak dulu. Node paling ramai = titik rawan. */
export function perNode(allAlerts) {
  const counts = new Map();
  for (const alert of incidents(allAlerts)) {
    counts.set(alert.nodeId, (counts.get(alert.nodeId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([nodeId, count]) => ({ nodeId, count }))
    .sort((a, b) => b.count - a.count || a.nodeId.localeCompare(b.nodeId));
}

/** Deret tegangan baterai urut waktu. Alert tanpa bacaan baterai dilewati,
 *  bukan diisi nol, supaya grafik tidak menggambar jurang palsu. */
export function batterySeries(alerts, limit = 60) {
  return alerts
    .filter((a) => a.battery !== null)
    .sort((a, b) => a.at - b.at)
    .slice(-limit)
    .map((a) => ({ at: a.at, volts: a.battery }));
}

export function batteryLevel(volts) {
  if (volts === null || volts === undefined) return 'unknown';
  if (volts < BATTERY_CRITICAL) return 'critical';
  if (volts < BATTERY_LOW) return 'low';
  return 'normal';
}

/** Memakai seluruh alert termasuk denyut: justru denyut yang membuktikan node
 *  masih hidup saat hutan sedang sepi. */
export function nodeHealth(alerts, now) {
  if (alerts.length === 0) return { lastSeen: null, silentFor: null, status: 'waiting' };

  const lastSeen = Math.max(...alerts.map((a) => a.at));
  const silentFor = Math.max(0, now - lastSeen);
  // Ambang mengikuti kemampuan node yang terbukti, bukan asumsi: selama belum ada
  // denyut yang pernah terlihat, diam masih dianggap wajar.
  const limit = alerts.some((a) => a.isHeartbeat) ? SILENT_AFTER_HEARTBEAT_MS : SILENT_AFTER_MS;

  return { lastSeen, silentFor, status: silentFor > limit ? 'silent' : 'online' };
}

/** "3 menit lalu" — dibaca sekilas, tanpa harus menghitung selisih jam sendiri. */
export function humanSince(ms) {
  if (ms === null || ms === undefined) return 'belum ada kontak';
  if (ms < 60_000) return 'baru saja';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

/** Buang kejadian yang sudah lewat jendela 24 jam supaya memori dan grafik
 *  tidak tumbuh tanpa batas selama dashboard menyala berhari-hari. */
export function withinWindow(alerts, now, windowMs = DAY_MS) {
  return alerts.filter((a) => now - a.at <= windowMs);
}
