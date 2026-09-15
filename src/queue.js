// Lógica de reservas y cola de atención. Todas las funciones son puras:
// reciben el estado y devuelven un estado nuevo sin mutar el original.
//
// La cola activa contiene todas las citas pendientes desde una fecha (normalmente
// hoy) en adelante, ordenadas por día y hora, de modo que cualquier reserva
// aparece en la lista de los puestos en cuanto se confirma.

export const STATUS = Object.freeze({
  PENDING: 'pending',
  CALLED: 'called',
  DONE: 'done',
  NO_SHOW: 'no_show',
});

export const EMPTY_STATE = Object.freeze({ appointments: [] });

export class QueueError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function byDateTimeThenCreation(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return a.createdAt < b.createdAt ? -1 : 1;
}

/** Citas de un día concreto, ordenadas por hora. */
export function appointmentsOn(state, date) {
  return state.appointments.filter((a) => a.date === date).sort(byDateTimeThenCreation);
}

/** Citas desde `fromDate` (incluido) en adelante, ordenadas por día y hora. */
export function appointmentsFrom(state, fromDate) {
  return state.appointments.filter((a) => a.date >= fromDate).sort(byDateTimeThenCreation);
}

export function bookedCount(state, date, time) {
  return state.appointments.filter((a) => a.date === date && a.time === time).length;
}

export function activeCodes(state, date) {
  return appointmentsOn(state, date).map((a) => a.code);
}

/** Crea una reserva nueva. Devuelve { state, appointment }. */
export function book(state, data, { capacity, code, now = new Date() }) {
  if (bookedCount(state, data.date, data.time) >= capacity) {
    throw new QueueError('Esa franja ya está ocupada', 409);
  }
  const appointment = {
    id: `${data.date}-${data.time}-${code}`,
    code,
    date: data.date,
    time: data.time,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    status: STATUS.PENDING,
    station: null,
    createdAt: now.toISOString(),
    calledAt: null,
    finishedAt: null,
  };
  return {
    state: { ...state, appointments: [...state.appointments, appointment] },
    appointment,
  };
}

function updateAppointment(state, id, patch) {
  return {
    ...state,
    appointments: state.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  };
}

/** Cita en atención en un puesto (sea del día que sea). */
export function currentAtStation(state, station) {
  return state.appointments.find(
    (a) => a.status === STATUS.CALLED && a.station === station,
  ) || null;
}

export function pendingFrom(state, fromDate) {
  return appointmentsFrom(state, fromDate).filter((a) => a.status === STATUS.PENDING);
}

/** Llamadas activas, la más reciente primero. */
export function called(state) {
  return state.appointments
    .filter((a) => a.status === STATUS.CALLED)
    .sort((a, b) => (a.calledAt < b.calledAt ? 1 : -1));
}

/**
 * Llama al siguiente pendiente (desde `fromDate`) para un puesto. Si el puesto
 * tenía alguien en atención, se marca como atendido. Devuelve
 * { state, appointment } donde appointment es null si no queda nadie en cola.
 */
export function callNext(state, fromDate, station, now = new Date()) {
  const finished = finishCurrent(state, station, now);
  const next = pendingFrom(finished, fromDate)[0];
  if (!next) return { state: finished, appointment: null };
  const patch = { status: STATUS.CALLED, station, calledAt: now.toISOString() };
  const updated = updateAppointment(finished, next.id, patch);
  return { state: updated, appointment: { ...next, ...patch } };
}

export function finishCurrent(state, station, now = new Date()) {
  const current = currentAtStation(state, station);
  if (!current) return state;
  return updateAppointment(state, current.id, {
    status: STATUS.DONE,
    finishedAt: now.toISOString(),
  });
}

export function markNoShow(state, station, now = new Date()) {
  const current = currentAtStation(state, station);
  if (!current) return state;
  return updateAppointment(state, current.id, {
    status: STATUS.NO_SHOW,
    finishedAt: now.toISOString(),
  });
}

/** Vuelve a llamar al cliente actual (mismo estado, refresca calledAt). */
export function recall(state, station, now = new Date()) {
  const current = currentAtStation(state, station);
  if (!current) return { state, appointment: null };
  const patch = { calledAt: now.toISOString() };
  return {
    state: updateAppointment(state, current.id, patch),
    appointment: { ...current, ...patch },
  };
}
