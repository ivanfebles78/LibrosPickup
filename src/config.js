import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const MIN_STATIONS = 1;
const MAX_STATIONS = 3;

function clampStations(value) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return MAX_STATIONS;
  return Math.min(MAX_STATIONS, Math.max(MIN_STATIONS, n));
}

export const CONFIG = Object.freeze({
  port: Number(process.env.PORT) || 3000,
  schoolName: process.env.SCHOOL_NAME || 'Centro Educativo Hispano Británico S21',
  stations: clampStations(process.env.STATIONS),
  // PIN opcional para las rutas de puestos (vacío = sin protección, solo red local)
  staffPin: process.env.STAFF_PIN || '',
  bookingRateLimit: Object.freeze({ max: 20, windowMs: 60 * 60 * 1000 }),
  slotMinutes: 10,
  ranges: Object.freeze([
    Object.freeze({ start: '08:30', end: '12:30', label: 'Mañana' }),
    Object.freeze({ start: '15:00', end: '17:00', label: 'Tarde' }),
  ]),
  slotCapacity: Number(process.env.SLOT_CAPACITY) || 1,
  weeksAhead: 4,
  codeLength: 4,
  // Sin 0/O/1/I para evitar confusiones al leer el código en pantalla
  codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  dataFile: process.env.DATA_FILE || path.join(ROOT, 'data', 'db.json'),
  publicDir: path.join(ROOT, 'public'),
});
