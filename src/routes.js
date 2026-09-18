import { Router } from 'express';
import { generateUniqueCode } from './codes.js';
import {
  QueueError, activeCodes, book, bookedCount, callNext, called, currentAtStation,
  finishCurrent, markNoShow, pendingFrom, recall,
} from './queue.js';
import {
  generateDaySlots, isPastSlot, mondayOf, nextWeek, parseDate, today, weekDays,
} from './slots.js';
import { parseStation, validateBooking } from './validate.js';
import { rateLimit, requireStaffPin } from './guards.js';
import { clampCount, clearDemo, seedDemo } from './demo.js';

/** Datos públicos de una cita (sin email/teléfono). */
function publicView(a) {
  if (!a) return null;
  const { email, phone, ...rest } = a;
  return rest;
}

/** Cola activa: pendientes desde `fromDate` en adelante y estado de los puestos. */
function queueSnapshot(state, config, fromDate) {
  const stations = Array.from({ length: config.stations }, (_, i) => i + 1).map((n) => ({
    station: n,
    current: publicView(currentAtStation(state, n)),
  }));
  return {
    today: fromDate,
    stations,
    pending: pendingFrom(state, fromDate).map(publicView),
    called: called(state).map(publicView),
  };
}

function weekSnapshot(state, config, monday, now) {
  const times = generateDaySlots(config.ranges, config.slotMinutes);
  const days = weekDays(monday).map((date) => ({
    date,
    slots: times.map((time) => {
      const taken = bookedCount(state, date, time) >= config.slotCapacity;
      const past = isPastSlot(date, time, now);
      return { time, available: !taken && !past, taken, past };
    }),
  }));
  return { monday, days, ranges: config.ranges };
}

export function createRouter({ config, store, notifier, broadcaster }) {
  const router = Router();

  const publishQueue = () => {
    broadcaster.broadcast('queue', queueSnapshot(store.getState(), config, today()));
  };

  const staffOnly = requireStaffPin(config.staffPin);
  const bookingLimiter = rateLimit(config.bookingRateLimit);

  router.get('/config', (_req, res) => {
    res.json({
      schoolName: config.schoolName,
      stations: config.stations,
      staffPinRequired: Boolean(config.staffPin),
      slotMinutes: config.slotMinutes,
      ranges: config.ranges,
      weeksAhead: config.weeksAhead,
      today: today(),
    });
  });

  router.get('/slots', (req, res) => {
    const requested = typeof req.query.week === 'string' ? req.query.week : today();
    const base = parseDate(requested) ? requested : today();
    const monday = mondayOf(base);
    const firstMonday = mondayOf(today());
    let lastMonday = firstMonday;
    for (let i = 1; i < config.weeksAhead; i += 1) lastMonday = nextWeek(lastMonday);
    if (monday < firstMonday || monday > lastMonday) {
      throw new QueueError('Semana fuera del periodo de reservas', 404);
    }
    res.json(weekSnapshot(store.getState(), config, monday, new Date()));
  });

  router.post('/appointments', bookingLimiter, async (req, res) => {
    const data = validateBooking(req.body, config);
    const { appointment } = store.update((state) => {
      const code = generateUniqueCode(config.codeAlphabet, config.codeLength, activeCodes(state, data.date));
      return book(state, data, { capacity: config.slotCapacity, code });
    });
    const delivery = await notifier.send(appointment);
    publishQueue();
    broadcaster.broadcast('slots', { date: appointment.date, time: appointment.time });
    res.status(201).json({ appointment: publicView(appointment), delivery });
  });

  router.get('/queue', (_req, res) => {
    res.json(queueSnapshot(store.getState(), config, today()));
  });

  router.post('/stations/:station/next', staffOnly, (req, res) => {
    const station = parseStation(req.params.station, config);
    const { appointment } = store.update((state) => callNext(state, today(), station));
    publishQueue();
    if (appointment) broadcaster.broadcast('call', publicView(appointment));
    res.json({ appointment: publicView(appointment) });
  });

  router.post('/stations/:station/recall', staffOnly, (req, res) => {
    const station = parseStation(req.params.station, config);
    const { appointment } = store.update((state) => recall(state, station));
    publishQueue();
    if (appointment) broadcaster.broadcast('call', publicView(appointment));
    res.json({ appointment: publicView(appointment) });
  });

  router.post('/stations/:station/done', staffOnly, (req, res) => {
    const station = parseStation(req.params.station, config);
    store.update((state) => finishCurrent(state, station));
    publishQueue();
    res.json({ ok: true });
  });

  router.post('/stations/:station/no-show', staffOnly, (req, res) => {
    const station = parseStation(req.params.station, config);
    store.update((state) => markNoShow(state, station));
    publishQueue();
    res.json({ ok: true });
  });

  // --- Datos de demostración (solo con STAFF_PIN configurado) ---
  const demoOnly = (req, res, next) => {
    if (!config.staffPin) return next(new QueueError('Configura STAFF_PIN para usar los datos de demo', 403));
    return staffOnly(req, res, next);
  };

  router.post('/demo/seed', demoOnly, (req, res) => {
    const count = clampCount(req.body?.count);
    const { created } = store.update((state) => seedDemo(state, config, { count, date: today() }));
    publishQueue();
    broadcaster.broadcast('slots', { date: today() });
    res.status(201).json({ created: created.map(publicView) });
  });

  router.delete('/demo', demoOnly, (_req, res) => {
    const { removed } = store.update((state) => clearDemo(state));
    publishQueue();
    broadcaster.broadcast('slots', { date: today() });
    res.json({ removed });
  });

  router.get('/events', (req, res) => {
    broadcaster.subscribe(req, res);
    res.write(`event: queue\ndata: ${JSON.stringify(queueSnapshot(store.getState(), config, today()))}\n\n`);
  });

  return router;
}
