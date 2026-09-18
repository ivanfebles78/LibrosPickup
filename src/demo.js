// Datos de demostración: familias ficticias colocadas justo antes de la
// primera cita real pendiente de hoy, para enseñar cómo avanza la cola.

import { generateUniqueCode } from './codes.js';
import { activeCodes, book, bookedCount, pendingFrom } from './queue.js';
import { generateDaySlots } from './slots.js';

export const DEMO_NAMES = Object.freeze([
  'Familia Rodríguez', 'Familia Hernández', 'Familia González', 'Familia Pérez',
  'Familia Martín', 'Familia Díaz', 'Familia Alonso', 'Familia Suárez',
]);

const DEFAULT_COUNT = 4;
const MAX_COUNT = 8;

export function clampCount(value) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(1, n));
}

function nowTime(now) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Elige las franjas a rellenar: las `count` libres inmediatamente anteriores a la
 * primera cita real pendiente de hoy. Si no hay cita real hoy, las `count`
 * primeras libres a partir de ahora.
 */
export function pickDemoSlots(state, { date, slots, count, capacity, now }) {
  const isFree = (time) => bookedCount(state, date, time) < capacity;
  const reference = pendingFrom(state, date).find((a) => a.date === date && !a.demo);
  if (reference) {
    return slots.filter((t) => t < reference.time && isFree(t)).slice(-count);
  }
  return slots.filter((t) => t >= nowTime(now) && isFree(t)).slice(0, count);
}

/** Crea las citas de demo. Devuelve { state, created }. */
export function seedDemo(state, config, { count = DEFAULT_COUNT, now = new Date(), date }) {
  const slots = generateDaySlots(config.ranges, config.slotMinutes);
  const times = pickDemoSlots(state, { date, slots, count, capacity: config.slotCapacity, now });
  const existing = state.appointments.filter((a) => a.demo).length;
  return times.reduce(
    (acc, time, i) => {
      const code = generateUniqueCode(config.codeAlphabet, config.codeLength, activeCodes(acc.state, date));
      const name = DEMO_NAMES[(existing + i) % DEMO_NAMES.length];
      const data = { date, time, name, email: null, phone: null };
      const { state: next, appointment } = book(acc.state, data, { capacity: config.slotCapacity, code, now });
      const flagged = { ...appointment, demo: true };
      return {
        state: { ...next, appointments: next.appointments.map((a) => (a.id === flagged.id ? flagged : a)) },
        created: [...acc.created, flagged],
      };
    },
    { state, created: [] },
  );
}

/** Elimina todas las citas de demo (de cualquier día y estado). */
export function clearDemo(state) {
  const remaining = state.appointments.filter((a) => !a.demo);
  return { state: { ...state, appointments: remaining }, removed: state.appointments.length - remaining.length };
}
