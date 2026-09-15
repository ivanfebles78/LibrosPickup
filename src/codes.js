import { randomInt } from 'node:crypto';

/** Genera un código aleatorio de `length` caracteres del alfabeto dado. */
export function generateCode(alphabet, length, random = randomInt) {
  return Array.from({ length }, () => alphabet[random(alphabet.length)]).join('');
}

/** Genera un código que no esté en `taken`. Lanza error tras `maxTries` intentos. */
export function generateUniqueCode(alphabet, length, taken, maxTries = 100, random = randomInt) {
  const takenSet = new Set(taken);
  for (let i = 0; i < maxTries; i += 1) {
    const code = generateCode(alphabet, length, random);
    if (!takenSet.has(code)) return code;
  }
  throw new Error('No se pudo generar un código único');
}
