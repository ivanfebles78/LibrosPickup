// Rellena el día de hoy con citas de ejemplo para probar la cola,
// y ocupa algunas franjas de los próximos días para ver el calendario mixto.
// Uso: npm run seed

import { CONFIG } from '../src/config.js';
import { generateUniqueCode } from '../src/codes.js';
import { EMPTY_STATE, activeCodes, book } from '../src/queue.js';
import { createStore } from '../src/store.js';
import { addDays, generateDaySlots, isWeekday, today } from '../src/slots.js';

const NAMES = [
  'Ana García', 'Luis Pérez', 'Marta Ruiz', 'Carlos Díaz', 'Lucía Fernández',
  'Pablo Martín', 'Elena Torres', 'Javier Molina', 'Sara Ortega', 'Diego Castro',
  'Nuria Vega', 'Raúl Navarro', 'Irene Sanz', 'Álvaro Gil', 'Carmen Prieto',
];

const TODAY_BOOKINGS = 12;
const FUTURE_DAYS = 6;
const FUTURE_FILL_RATIO = 0.35;

function pick(list, i) {
  return list[i % list.length];
}

function addBooking(state, date, time, i) {
  const code = generateUniqueCode(CONFIG.codeAlphabet, CONFIG.codeLength, activeCodes(state, date));
  const name = pick(NAMES, i);
  const email = `${name.split(' ')[0].toLowerCase()}@ejemplo.es`;
  return book(state, { date, time, name, email, phone: null }, { capacity: CONFIG.slotCapacity, code }).state;
}

function seedToday(state, slots) {
  const date = today();
  if (!isWeekday(date)) {
    console.log('Hoy no es laborable; no se crean citas para hoy.');
    return state;
  }
  return slots.slice(0, TODAY_BOOKINGS).reduce((acc, time, i) => addBooking(acc, date, time, i), state);
}

function seedFuture(state, slots) {
  let acc = state;
  let date = today();
  let counter = 0;
  for (let d = 0; d < FUTURE_DAYS; d += 1) {
    date = addDays(date, 1);
    if (!isWeekday(date)) continue;
    slots.forEach((time, i) => {
      if ((i * 7 + d * 3) % 100 < FUTURE_FILL_RATIO * 100) {
        acc = addBooking(acc, date, time, counter);
        counter += 1;
      }
    });
  }
  return acc;
}

const store = createStore(CONFIG.dataFile);
const slots = generateDaySlots(CONFIG.ranges, CONFIG.slotMinutes);
store.update(() => seedFuture(seedToday(EMPTY_STATE, slots), slots));
console.log(`Creadas ${store.getState().appointments.length} citas de ejemplo en ${CONFIG.dataFile}`);
