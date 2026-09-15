// Utilidades de fechas y franjas horarias. Todas las fechas son cadenas
// 'YYYY-MM-DD' y las horas 'HH:MM', interpretadas en hora local.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const MONDAY = 1;
const FRIDAY = 5;
const DAYS_PER_WEEK = 7;
const MS_PER_MINUTE = 60 * 1000;

export function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total) {
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function parseDate(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const isSame = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return isSame ? date : null;
}

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  return formatDate(next);
}

export function isWeekday(dateStr) {
  const date = parseDate(dateStr);
  if (!date) return false;
  const dow = date.getDay();
  return dow >= MONDAY && dow <= FRIDAY;
}

/** Lunes de la semana a la que pertenece la fecha dada. */
export function mondayOf(dateStr) {
  const date = parseDate(dateStr);
  const dow = date.getDay();
  const offset = dow === 0 ? -6 : MONDAY - dow;
  return addDays(dateStr, offset);
}

/** Los cinco días laborables (lun–vie) de la semana que empieza en `monday`. */
export function weekDays(monday) {
  return Array.from({ length: FRIDAY }, (_, i) => addDays(monday, i));
}

export function nextWeek(monday) {
  return addDays(monday, DAYS_PER_WEEK);
}

/** Genera todas las horas de inicio de franja para un día. */
export function generateDaySlots(ranges, slotMinutes) {
  return ranges.flatMap((range) => {
    const start = toMinutes(range.start);
    const end = toMinutes(range.end);
    const count = Math.floor((end - start) / slotMinutes);
    return Array.from({ length: count }, (_, i) => fromMinutes(start + i * slotMinutes));
  });
}

export function isValidTime(time, ranges, slotMinutes) {
  if (typeof time !== 'string' || !TIME_RE.test(time)) return false;
  return generateDaySlots(ranges, slotMinutes).includes(time);
}

/** True si la franja ya ha empezado respecto al instante `now`. */
export function isPastSlot(dateStr, time, now = new Date()) {
  const date = parseDate(dateStr);
  if (!date) return true;
  const slotStart = new Date(date.getTime() + toMinutes(time) * MS_PER_MINUTE);
  return slotStart.getTime() <= now.getTime();
}

export function today(now = new Date()) {
  return formatDate(now);
}
