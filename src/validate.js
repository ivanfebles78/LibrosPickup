// Validación de la entrada del formulario de reserva.

import { isPastSlot, isValidTime, isWeekday, parseDate, today, addDays, mondayOf, nextWeek } from './slots.js';
import { QueueError } from './queue.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ]{9,15}$/;
const MAX_NAME = 80;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function lastBookableDay(config, now = new Date()) {
  let monday = mondayOf(today(now));
  for (let i = 1; i < config.weeksAhead; i += 1) monday = nextWeek(monday);
  return addDays(monday, 4);
}

/** Devuelve los datos limpios o lanza QueueError con un mensaje legible. */
export function validateBooking(body, config, now = new Date()) {
  const name = cleanText(body?.name);
  const email = cleanText(body?.email).toLowerCase();
  const phone = cleanText(body?.phone).replace(/[-().]/g, '');
  const date = cleanText(body?.date);
  const time = cleanText(body?.time);

  if (!name || name.length > MAX_NAME) throw new QueueError('Indica tu nombre');
  if (!email && !phone) throw new QueueError('Necesitamos un email o un móvil para enviarte el código');
  if (email && !EMAIL_RE.test(email)) throw new QueueError('El email no parece válido');
  if (phone && !PHONE_RE.test(phone)) throw new QueueError('El móvil no parece válido');
  if (!parseDate(date) || !isWeekday(date)) throw new QueueError('La fecha debe ser de lunes a viernes');
  if (date > lastBookableDay(config, now)) throw new QueueError('Esa fecha está fuera del periodo de reservas');
  if (!isValidTime(time, config.ranges, config.slotMinutes)) throw new QueueError('Hora no válida');
  if (isPastSlot(date, time, now)) throw new QueueError('Esa franja ya ha pasado');

  return { name, email, phone: phone.replace(/ /g, ''), date, time };
}

export function parseStation(value, config) {
  const station = Number.parseInt(value, 10);
  if (Number.isNaN(station) || station < 1 || station > config.stations) {
    throw new QueueError(`El puesto debe estar entre 1 y ${config.stations}`, 404);
  }
  return station;
}
