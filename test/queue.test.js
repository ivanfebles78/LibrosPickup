import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_STATE, QueueError, STATUS, book, callNext, called, currentAtStation,
  finishCurrent, markNoShow, pendingFrom, recall,
} from '../src/queue.js';

const DAY = '2026-09-15';
const NOW = new Date('2026-09-15T08:00:00Z');

const NEXT_DAY = '2026-09-16';

function seed(times, date = DAY) {
  return times.reduce((state, time, i) => {
    const data = { date, time, name: `Familia ${i}`, email: `f${i}@x.es` };
    return book(state, data, { capacity: 1, code: `C${i}`, now: new Date(NOW.getTime() + i) }).state;
  }, EMPTY_STATE);
}

test('book añade una cita sin mutar el estado original', () => {
  const data = { date: DAY, time: '08:30', name: 'Ana', email: 'a@x.es' };
  const { state, appointment } = book(EMPTY_STATE, data, { capacity: 1, code: 'AB12', now: NOW });
  assert.equal(EMPTY_STATE.appointments.length, 0);
  assert.equal(state.appointments.length, 1);
  assert.equal(appointment.code, 'AB12');
  assert.equal(appointment.status, STATUS.PENDING);
});

test('book rechaza una franja que ya ha llegado a su capacidad', () => {
  const state = seed(['08:30']);
  const data = { date: DAY, time: '08:30', name: 'Otra', email: 'o@x.es' };
  assert.throws(() => book(state, data, { capacity: 1, code: 'ZZ99' }), (err) => {
    assert.ok(err instanceof QueueError);
    assert.equal(err.status, 409);
    return true;
  });
  const ok = book(state, data, { capacity: 2, code: 'ZZ99' });
  assert.equal(ok.state.appointments.length, 2);
});

test('callNext llama al pendiente más temprano y lo asigna al puesto', () => {
  const state = seed(['09:00', '08:30', '08:40']);
  const { state: next, appointment } = callNext(state, DAY, 2, NOW);
  assert.equal(appointment.time, '08:30');
  assert.equal(appointment.station, 2);
  assert.equal(currentAtStation(next, 2).code, appointment.code);
  assert.deepEqual(pendingFrom(next, DAY).map((a) => a.time), ['08:40', '09:00']);
});

test('callNext finaliza al actual del puesto antes de llamar al siguiente', () => {
  const state = seed(['08:30', '08:40']);
  const first = callNext(state, DAY, 1, NOW).state;
  const second = callNext(first, DAY, 1, NOW);
  const done = second.state.appointments.find((a) => a.time === '08:30');
  assert.equal(done.status, STATUS.DONE);
  assert.equal(second.appointment.time, '08:40');
});

test('callNext devuelve null cuando no queda nadie', () => {
  const state = seed(['08:30']);
  const first = callNext(state, DAY, 1, NOW).state;
  const { appointment } = callNext(first, DAY, 1, NOW);
  assert.equal(appointment, null);
});

test('dos puestos no se pisan al llamar', () => {
  const state = seed(['08:30', '08:40', '08:50']);
  const s1 = callNext(state, DAY, 1, NOW);
  const s2 = callNext(s1.state, DAY, 2, NOW);
  assert.notEqual(s1.appointment.code, s2.appointment.code);
  assert.equal(currentAtStation(s2.state, 1).time, '08:30');
  assert.equal(currentAtStation(s2.state, 2).time, '08:40');
  assert.equal(called(s2.state).length, 2);
});

test('finishCurrent y markNoShow cierran la atención del puesto', () => {
  const state = seed(['08:30', '08:40']);
  const calledState = callNext(state, DAY, 1, NOW).state;
  const finished = finishCurrent(calledState, 1, NOW);
  assert.equal(currentAtStation(finished, 1), null);
  assert.equal(finished.appointments[0].status, STATUS.DONE);

  const called2 = callNext(finished, DAY, 1, NOW).state;
  const noShow = markNoShow(called2, 1, NOW);
  assert.equal(noShow.appointments[1].status, STATUS.NO_SHOW);
  assert.equal(finishCurrent(noShow, 3), noShow, 'sin cliente devuelve el mismo estado');
});

test('recall devuelve el cliente actual con calledAt actualizado', () => {
  const state = seed(['08:30']);
  const calledState = callNext(state, DAY, 1, NOW).state;
  const later = new Date(NOW.getTime() + 60_000);
  const { appointment } = recall(calledState, 1, later);
  assert.equal(appointment.calledAt, later.toISOString());
  assert.equal(recall(calledState, 2).appointment, null);
});

test('la cola incluye citas de días posteriores, después de las de hoy', () => {
  const withToday = seed(['09:00']);
  const withTomorrow = seed(['08:30'], NEXT_DAY).appointments[0];
  const state = { appointments: [withTomorrow, ...withToday.appointments] };
  assert.deepEqual(pendingFrom(state, DAY).map((a) => a.date), [DAY, NEXT_DAY]);
  const first = callNext(state, DAY, 1, NOW);
  assert.equal(first.appointment.date, DAY);
  const second = callNext(first.state, DAY, 2, NOW);
  assert.equal(second.appointment.date, NEXT_DAY);
  assert.deepEqual(pendingFrom(state, NEXT_DAY).map((a) => a.date), [NEXT_DAY], 'las de ayer quedan fuera');
});
