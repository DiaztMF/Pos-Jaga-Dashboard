/**
 * Data contoh untuk presentasi dan pengujian tata letak. TIDAK PERNAH ditulis
 * ke Firebase — hanya hidup di memori tab ini dan hilang saat halaman dimuat
 * ulang, supaya tidak ada kemungkinan tercampur dengan kejadian sungguhan.
 *
 * Payload yang dihasilkan sengaja berbentuk sama persis dengan yang dikirim
 * pos_jaga.ino, jadi ia melewati normalizeAlert() yang sama dengan data asli.
 */

import { HOUR_MS } from './stats.js';

/** PRNG bersemai: satu tombol Mode Demo selalu menghasilkan cerita 24 jam yang
 *  sama, jadi demo sidang tidak berubah-ubah di tengah penjelasan. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pembalakan liar menumpuk di dini hari saat pos jaga paling sepi. Bobot per
 *  jam ini yang membuat grafik 24 jam bercerita, bukan sekadar acak rata. */
const CHAINSAW_WEIGHT = [
  5, 7, 8, 7, 5, 2, 0, 0, 0, 0, 0, 0,
  2, 2, 1, 0, 0, 0, 0, 1, 2, 3, 4, 5,
];

export function generateDemoAlerts(now, seed = 20260818) {
  const random = seededRandom(seed);
  const alerts = [];
  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;

  for (let back = 23; back >= 0; back -= 1) {
    const hourStart = currentHour - back * HOUR_MS;
    const hourOfDay = new Date(hourStart).getHours();

    const chainsawCount = random() < 0.8 ? Math.round(CHAINSAW_WEIGHT[hourOfDay] * random()) : 0;
    const natureCount = random() < 0.7 ? Math.round(3 * random()) : 0;

    for (let i = 0; i < chainsawCount; i += 1) {
      alerts.push(makeAlert(hourStart, random, 'CHAINSAW', back));
    }
    for (let i = 0; i < natureCount; i += 1) {
      alerts.push(makeAlert(hourStart, random, 'VIBRATION', back));
    }
  }

  // Kejadian terbaru selalu ada supaya kartu "kontak terakhir" tidak kosong,
  // tapi bukan chainsaw: demo tidak boleh membunyikan sirine sendiri.
  alerts.push(makeAlert(currentHour, random, 'VIBRATION', 0, now - 4 * 60_000));
  return alerts.sort((a, b) => a.timestamp - b.timestamp);
}

function makeAlert(hourStart, random, type, hoursBack, forcedAt) {
  const isChainsaw = type === 'CHAINSAW';
  // Baterai turun perlahan sepanjang 24 jam, dari 4.05 V ke sekitar 3.62 V.
  const drain = 4.05 - (23 - hoursBack) * 0.018 - random() * 0.02;

  return {
    node_id: random() < 0.78 ? '0x01' : '0x02',
    alert_type: type,
    alert_code: isChainsaw ? '0xAA' : '0xBB',
    confidence: isChainsaw ? 82 + Math.round(random() * 16) : 61 + Math.round(random() * 24),
    battery: Number(drain.toFixed(2)),
    timestamp: forcedAt ?? hourStart + Math.floor(random() * HOUR_MS),
  };
}
