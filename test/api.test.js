import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { CONFIG } from '../src/config.js';
import { createStore } from '../src/store.js';
import { createBroadcaster } from '../src/events.js';
import { addDays, mondayOf, nextWeek, today } from '../src/slots.js';

function nextWeekMonday() {
  return nextWeek(mondayOf(today()));
}

async function startServer(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recogida-'));
  const sent = [];
  const notifier = { send: async (a) => { sent.push(a); return { email: 'simulated', sms: 'skipped' }; } };
  const app = createApp(
    { ...CONFIG, stations: 2, dataFile: path.join(dir, 'db.json'), ...overrides },
    { store: createStore(path.join(dir, 'db.json')), notifier, broadcaster: createBroadcaster() },
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (p, opts = {}) => {
    const res = await fetch(base + p, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return { call, sent, close: () => server.close() };
}

test('GET /slots devuelve la semana con 36 franjas por día', async () => {
  const { call, close } = await startServer();
  try {
    const { status, body } = await call(`/slots?week=${nextWeekMonday()}`);
    assert.equal(status, 200);
    assert.equal(body.days.length, 5);
    assert.equal(body.days[0].slots.length, 36);
    assert.ok(body.days[0].slots.every((s) => s.available));
  } finally {
    close();
  }
});

test('POST /appointments reserva, notifica y bloquea la franja', async () => {
  const { call, sent, close } = await startServer();
  try {
    const date = nextWeekMonday();
    const data = { name: 'Ana', email: 'ana@x.es', date, time: '08:30' };
    const created = await call('/appointments', { method: 'POST', body: data });
    assert.equal(created.status, 201);
    assert.match(created.body.appointment.code, /^[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(created.body.appointment.email, undefined, 'no expone datos personales');
    assert.equal(sent.length, 1);

    const dup = await call('/appointments', { method: 'POST', body: data });
    assert.equal(dup.status, 409);

    const { body } = await call(`/slots?week=${date}`);
    const slot = body.days[0].slots.find((s) => s.time === '08:30');
    assert.equal(slot.taken, true);
    assert.equal(slot.available, false);
  } finally {
    close();
  }
});

test('POST /appointments valida los datos', async () => {
  const { call, close } = await startServer();
  try {
    const date = nextWeekMonday();
    const cases = [
      [{ name: '', email: 'a@x.es', date, time: '08:30' }, /nombre/],
      [{ name: 'Ana', date, time: '08:30' }, /email o un móvil/],
      [{ name: 'Ana', email: 'malo', date, time: '08:30' }, /email/],
      [{ name: 'Ana', email: 'a@x.es', date: addDays(date, 5), time: '08:30' }, /lunes a viernes/],
      [{ name: 'Ana', email: 'a@x.es', date, time: '08:35' }, /Hora/],
      [{ name: 'Ana', email: 'a@x.es', date: addDays(date, -14), time: '08:30' }, /pasado/],
    ];
    for (const [body, re] of cases) {
      const res = await call('/appointments', { method: 'POST', body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match(res.body.error, re);
    }
  } finally {
    close();
  }
});

test('flujo de puestos: siguiente, finalizado, no se presenta', async () => {
  const { call, close } = await startServer();
  try {
    const empty = await call('/stations/1/next', { method: 'POST' });
    assert.equal(empty.body.appointment, null);

    // Las reservas futuras entran en la cola en cuanto se confirman
    const day = nextWeekMonday();
    const times = ['08:40', '08:30', '08:50'];
    const codes = [];
    for (const time of times) {
      const r = await call('/appointments', { method: 'POST', body: { name: 'F', phone: '612345678', date: day, time } });
      assert.equal(r.status, 201);
      codes.push(r.body.appointment.code);
    }
    const queued = await call('/queue');
    assert.deepEqual(queued.body.pending.map((a) => a.time), ['08:30', '08:40', '08:50']);
    assert.ok(codes.every((c) => queued.body.pending.some((a) => a.code === c)));

    const first = await call('/stations/1/next', { method: 'POST' });
    assert.equal(first.body.appointment.time, '08:30');
    const second = await call('/stations/2/next', { method: 'POST' });
    assert.equal(second.body.appointment.time, '08:40');

    await call('/stations/1/done', { method: 'POST' });
    await call('/stations/2/no-show', { method: 'POST' });
    const q = await call('/queue');
    assert.equal(q.body.pending.length, 1);
    assert.equal(q.body.stations.every((s) => s.current === null), true);

    const bad = await call('/stations/9/next', { method: 'POST' });
    assert.equal(bad.status, 404);
  } finally {
    close();
  }
});

test('las rutas de puestos exigen el PIN cuando está configurado', async () => {
  const { call, close } = await startServer({ staffPin: '4321' });
  try {
    const cfg = await call('/config');
    assert.equal(cfg.body.staffPinRequired, true);
    const denied = await call('/stations/1/next', { method: 'POST' });
    assert.equal(denied.status, 401);
    const wrong = await call('/stations/1/next', { method: 'POST', headers: { 'X-Staff-Pin': '0000' } });
    assert.equal(wrong.status, 401);
    const ok = await call('/stations/1/next', { method: 'POST', headers: { 'X-Staff-Pin': '4321' } });
    assert.equal(ok.status, 200);
  } finally {
    close();
  }
});

test('las reservas se limitan por IP', async () => {
  const { call, close } = await startServer({ bookingRateLimit: { max: 2, windowMs: 60_000 } });
  try {
    const day = nextWeekMonday();
    const body = (time) => ({ name: 'F', email: 'f@x.es', date: day, time });
    assert.equal((await call('/appointments', { method: 'POST', body: body('08:30') })).status, 201);
    assert.equal((await call('/appointments', { method: 'POST', body: body('08:40') })).status, 201);
    const limited = await call('/appointments', { method: 'POST', body: body('08:50') });
    assert.equal(limited.status, 429);
  } finally {
    close();
  }
});
