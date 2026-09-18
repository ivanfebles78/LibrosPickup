import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertWritable, createStore } from '../src/store.js';

test('el store persiste y recarga el estado', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'store-')), 'db.json');
  const store = createStore(file);
  store.update((s) => ({ ...s, appointments: [{ id: 'a' }] }));
  assert.equal(createStore(file).getState().appointments.length, 1);
});

test('si la escritura falla, el estado en memoria no cambia', () => {
  // Ruta imposible: el "directorio" es un archivo normal
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-'));
  const blocker = path.join(dir, 'blocker');
  fs.writeFileSync(blocker, 'x');
  const store = createStore(path.join(blocker, 'db.json'));
  assert.throws(() => store.update((s) => ({ ...s, appointments: [{ id: 'a' }] })));
  assert.equal(store.getState().appointments.length, 0);
  assert.throws(() => assertWritable(path.join(blocker, 'db.json')));
});
