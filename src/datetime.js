/**
 * Format tanggal dan waktu untuk seluruh dashboard. Satu tempat, supaya jam di
 * header, kolom waktu di tabel, dan kartu "kontak terakhir" tidak pernah
 * memakai gaya penulisan yang berbeda.
 *
 * Semua fungsi murni dan menerima `now` dari luar, jadi bisa diuji tanpa
 * menunggu jam dinding bergerak.
 */

const timeFormat = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const shortTimeFormat = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
const shortDateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const compactDateFormat = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
const headerDateFormat = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fullFormat = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export const formatTime = (ms) => timeFormat.format(ms);
export const formatShortTime = (ms) => shortTimeFormat.format(ms);
export const formatShortDate = (ms) => shortDateFormat.format(ms);
export const formatHeaderDate = (ms) => headerDateFormat.format(ms);
/** Bentuk pendek jam header saat layar tidak cukup lebar untuk tanggal penuh. */
export const formatCompactDate = (ms) => compactDateFormat.format(ms);

/** Dipakai sebagai tooltip: satu-satunya tempat waktu ditulis lengkap tanpa singkatan. */
export const formatFull = (ms) => fullFormat.format(ms);

/**
 * Selisih hari kalender, bukan selisih 24 jam. Pukul 23.59 dan 00.01 hanya
 * berjarak dua menit tetapi berbeda hari, dan itulah yang membingungkan petugas
 * saat membaca log dini hari.
 */
export function dayOffset(ms, now) {
  const startOfDay = (value) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  return Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000);
}

/** Label hari yang cukup dibaca sekilas. Tanggal penuh hanya muncul bila perlu. */
export function formatDayLabel(ms, now) {
  const offset = dayOffset(ms, now);
  if (offset === 0) return 'Hari ini';
  if (offset === 1) return 'Kemarin';
  if (offset === -1) return 'Besok'; // jam node melenceng ke depan, tetap harus terbaca
  return formatShortDate(ms);
}

/** true bila stempel waktu jatuh pada hari kalender yang sama dengan `now`. */
export const isToday = (ms, now) => dayOffset(ms, now) === 0;
