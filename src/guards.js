// Middlewares de protección: PIN del personal y límite de reservas por IP.

import { timingSafeEqual } from 'node:crypto';
import { QueueError } from './queue.js';

const PIN_HEADER = 'x-staff-pin';

function sameString(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Exige el PIN del personal (cabecera X-Staff-Pin) si está configurado.
 * Sin PIN configurado, las rutas de puestos quedan abiertas (uso en red local).
 */
export function requireStaffPin(pin) {
  return (req, _res, next) => {
    if (!pin) return next();
    const provided = req.get(PIN_HEADER) || '';
    if (!sameString(provided, pin)) return next(new QueueError('PIN de personal incorrecto', 401));
    return next();
  };
}

/**
 * Limitador sencillo en memoria: como mucho `max` peticiones por IP en la
 * ventana `windowMs`. Suficiente para frenar scripts que intenten reservar
 * todas las franjas; en despliegues grandes usar express-rate-limit.
 */
export function rateLimit({ max, windowMs, now = Date.now }) {
  const hits = new Map();

  const prune = (ts) => {
    for (const [ip, entry] of hits) {
      if (ts - entry.start > windowMs) hits.delete(ip);
    }
  };

  return (req, _res, next) => {
    const ts = now();
    if (hits.size > 1000) prune(ts);
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const entry = hits.get(ip);
    const current = entry && ts - entry.start <= windowMs ? entry : { start: ts, count: 0 };
    const updated = { ...current, count: current.count + 1 };
    hits.set(ip, updated);
    if (updated.count > max) {
      return next(new QueueError('Demasiadas reservas seguidas. Inténtalo dentro de unos minutos.', 429));
    }
    return next();
  };
}
