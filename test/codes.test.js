import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, generateUniqueCode } from '../src/codes.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

test('genera códigos de 4 caracteres del alfabeto permitido', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateCode(ALPHABET, 4);
    assert.equal(code.length, 4);
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/);
  }
});

test('evita códigos ya usados', () => {
  // random determinista: primero devuelve índices que forman "AAAA", luego "BBBB"
  const sequence = [0, 0, 0, 0, 1, 1, 1, 1];
  const random = () => sequence.shift();
  const code = generateUniqueCode(ALPHABET, 4, ['AAAA'], 10, random);
  assert.equal(code, 'BBBB');
});

test('lanza error si no consigue un código único', () => {
  const random = () => 0;
  assert.throws(() => generateUniqueCode(ALPHABET, 4, ['AAAA'], 5, random), /único/);
});
