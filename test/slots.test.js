import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, fromMinutes, generateDaySlots, isPastSlot, isValidTime, isWeekday,
  mondayOf, parseDate, toMinutes, weekDays,
} from '../src/slots.js';

const RANGES = [
  { start: '08:30', end: '12:30' },
  { start: '15:00', end: '17:00' },
];

test('genera 24 franjas de mañana y 12 de tarde', () => {
  const slots = generateDaySlots(RANGES, 10);
  assert.equal(slots.length, 36);
  assert.equal(slots[0], '08:30');
  assert.equal(slots[23], '12:20');
  assert.equal(slots[24], '15:00');
  assert.equal(slots.at(-1), '16:50');
});

test('convierte horas a minutos y viceversa', () => {
  assert.equal(toMinutes('08:30'), 510);
  assert.equal(fromMinutes(510), '08:30');
  assert.equal(fromMinutes(1010), '16:50');
});

test('valida horas solo si coinciden con una franja', () => {
  assert.equal(isValidTime('08:30', RANGES, 10), true);
  assert.equal(isValidTime('08:35', RANGES, 10), false);
  assert.equal(isValidTime('12:30', RANGES, 10), false);
  assert.equal(isValidTime('nope', RANGES, 10), false);
  assert.equal(isValidTime(undefined, RANGES, 10), false);
});

test('reconoce fechas válidas y días laborables', () => {
  assert.ok(parseDate('2026-09-15'));
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('15/09/2026'), null);
  assert.equal(isWeekday('2026-09-15'), true); // martes
  assert.equal(isWeekday('2026-09-19'), false); // sábado
  assert.equal(isWeekday('2026-09-20'), false); // domingo
});

test('calcula el lunes de la semana y los cinco días laborables', () => {
  assert.equal(mondayOf('2026-09-15'), '2026-09-14');
  assert.equal(mondayOf('2026-09-20'), '2026-09-14');
  assert.equal(mondayOf('2026-09-14'), '2026-09-14');
  assert.deepEqual(weekDays('2026-09-14'), [
    '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
  ]);
});

test('addDays cruza fin de mes y de año', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('detecta franjas pasadas respecto a un instante', () => {
  const now = new Date(2026, 8, 15, 10, 0);
  assert.equal(isPastSlot('2026-09-15', '09:50', now), true);
  assert.equal(isPastSlot('2026-09-15', '10:00', now), true);
  assert.equal(isPastSlot('2026-09-15', '10:10', now), false);
  assert.equal(isPastSlot('2026-09-16', '08:30', now), false);
});
