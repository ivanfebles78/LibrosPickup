import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { clearDemo, seedDemo } from '../src/demo.js';
import { EMPTY_STATE, book, callNext, pendingFrom } from '../src/queue.js';

const DAY = '2026-09-18';
const NOW = new Date(2026, 8, 18, 9, 0);
const config = { ...CONFIG, slotCapacity: 1 };

function withRealBooking(time) {
  const data = { date: DAY, time, name: 'Ivan', email: 'i@x.es' };
  return book(EMPTY_STATE, data, { capacity: 1, code: 'REAL', now: NOW }).state;
}

test('coloca 4 familias justo antes de la cita real y quedan por delante en la cola', () => {
  const { state, created } = seedDemo(withRealBooking('12:20'), config, { count: 4, now: NOW, date: DAY });
  assert.deepEqual(created.map((a) => a.time), ['11:40', '11:50', '12:00', '12:10']);
  assert.ok(created.every((a) => a.demo && a.name.startsWith('Familia')));
  const order = pendingFrom(state, DAY).map((a) => a.code);
  assert.equal(order.at(-1), 'REAL');
  assert.equal(order.length, 5);
  const first = callNext(state, DAY, 1, NOW);
  assert.equal(first.appointment.time, '11:40');
});

test('toma como referencia la cita real más temprana y no pisa franjas ocupadas', () => {
  const busy = book(withRealBooking('09:30'), { date: DAY, time: '09:10', name: 'Otro', email: 'o@x.es' }, { capacity: 1, code: 'OTRO', now: NOW }).state;
  const { created } = seedDemo(busy, config, { count: 4, now: NOW, date: DAY });
  assert.deepEqual(created.map((a) => a.time), ['08:30', '08:40', '08:50', '09:00']);
  const again = seedDemo(seedDemo(busy, config, { count: 4, now: NOW, date: DAY }).state, config, { count: 4, now: NOW, date: DAY });
  assert.equal(again.created.length, 0, 'no quedan franjas libres antes de la referencia');
});

test('sin cita real usa las próximas franjas libres a partir de ahora', () => {
  const { created } = seedDemo(EMPTY_STATE, config, { count: 3, now: NOW, date: DAY });
  assert.deepEqual(created.map((a) => a.time), ['09:00', '09:10', '09:20']);
});

test('clearDemo borra solo las citas de demo', () => {
  const { state } = seedDemo(withRealBooking('10:00'), config, { count: 2, now: NOW, date: DAY });
  const { state: cleaned, removed } = clearDemo(state);
  assert.equal(removed, 2);
  assert.deepEqual(cleaned.appointments.map((a) => a.code), ['REAL']);
});
