import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, requireStaffPin } from '../src/guards.js';
import { mask } from '../src/notify.js';

function run(middleware, req) {
  return new Promise((resolve) => middleware(req, {}, (err) => resolve(err || null)));
}

const reqWithPin = (pin) => ({ get: (h) => (h === 'x-staff-pin' ? pin : undefined) });

test('requireStaffPin deja pasar cuando no hay PIN configurado', async () => {
  assert.equal(await run(requireStaffPin(''), reqWithPin(undefined)), null);
});

test('requireStaffPin exige el PIN correcto', async () => {
  const guard = requireStaffPin('1234');
  assert.equal(await run(guard, reqWithPin('1234')), null);
  const wrong = await run(guard, reqWithPin('0000'));
  assert.equal(wrong.status, 401);
  const missing = await run(guard, reqWithPin(undefined));
  assert.equal(missing.status, 401);
});

test('rateLimit bloquea a partir del máximo y se reinicia tras la ventana', async () => {
  let clock = 0;
  const limiter = rateLimit({ max: 2, windowMs: 1000, now: () => clock });
  const req = { ip: '1.2.3.4' };
  assert.equal(await run(limiter, req), null);
  assert.equal(await run(limiter, req), null);
  const blocked = await run(limiter, req);
  assert.equal(blocked.status, 429);
  assert.equal(await run(limiter, { ip: '5.6.7.8' }), null, 'otra IP no se ve afectada');
  clock = 2000;
  assert.equal(await run(limiter, req), null, 'ventana nueva');
});

test('mask oculta emails y teléfonos en los logs', () => {
  assert.equal(mask('ana.garcia@correo.es'), 'an***@correo.es');
  assert.equal(mask('612345678'), '******678');
  assert.equal(mask(''), '');
});
