import fs from 'node:fs';
import path from 'node:path';
import { EMPTY_STATE } from './queue.js';

function readState(file) {
  if (!fs.existsSync(file)) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed.appointments)) return EMPTY_STATE;
    return parsed;
  } catch (err) {
    console.error(`[store] No se pudo leer ${file}, se parte de un estado vacío:`, err.message);
    return EMPTY_STATE;
  }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

/** Comprueba al arrancar que se puede escribir donde vive la base de datos. */
export function assertWritable(file) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    throw new Error(
      `No se puede escribir en ${dir}. Si es un volumen de Railway, el contenedor ` +
      'debe correr como root o el directorio debe pertenecer al usuario del proceso.',
    );
  }
}

/**
 * Almacén en memoria respaldado por un archivo JSON. `update` recibe una
 * función pura (state) => nuevoEstado o (state) => ({ state, ...extra }).
 * Si la escritura en disco falla, el estado en memoria no cambia.
 */
export function createStore(file) {
  let state = readState(file);

  return {
    getState: () => state,
    update(fn) {
      const result = fn(state);
      const next = result && result.state ? result.state : result;
      if (next !== state) {
        writeState(file, next);
        state = next;
      }
      return result;
    },
  };
}
