import { api, el, formatLong, formatShort, parseDate, subscribe } from './api.js';

const $ = (id) => document.getElementById(id);
const DOW_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

let state = {
  config: null,
  monday: null,
  firstMonday: null,
  lastMonday: null,
  week: null,
  day: null,
  slot: null,
  booking: false,
};

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function addWeeks(dateStr, n) {
  const d = parseDate(dateStr);
  const shifted = new Date(d.getTime() + n * MS_PER_WEEK);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadWeek(monday) {
  const week = await api(`/slots?week=${monday}`);
  const preferred = state.day && week.days.some((d) => d.date === state.day) ? state.day : null;
  const firstOpen = week.days.find((d) => d.slots.some((s) => s.available));
  setState({
    monday: week.monday,
    week,
    day: preferred || (firstOpen ? firstOpen.date : week.days[0].date),
    slot: state.week && state.week.monday === week.monday ? state.slot : null,
  });
}

/* ---------- Render ---------- */

function renderWeekNav() {
  const { monday, firstMonday, lastMonday, week } = state;
  const last = week.days[week.days.length - 1].date;
  $('week-label').textContent = `${formatShort(monday)} – ${formatShort(last)}`;
  $('week-prev').disabled = monday <= firstMonday;
  $('week-next').disabled = monday >= lastMonday;
}

function renderDayTabs() {
  const tabs = $('day-tabs');
  tabs.replaceChildren(
    ...state.week.days.map((d) => {
      const free = d.slots.filter((s) => s.available).length;
      const isPast = d.slots.every((s) => s.past);
      const date = parseDate(d.date);
      return el(
        'button',
        {
          class: 'day-tab',
          role: 'tab',
          type: 'button',
          'aria-selected': String(d.date === state.day),
          disabled: free === 0 ? '' : null,
          onclick: () => setState({ day: d.date, slot: null }),
        },
        el('span', { class: 'dow' }, DOW_SHORT[date.getDay()]),
        el('span', { class: 'dom' }, String(date.getDate())),
        el('span', { class: 'free' }, free ? `${free} libres` : isPast ? 'pasado' : 'completo'),
      );
    }),
  );
}

function slotButton(day, s) {
  const isSelected = state.slot && state.slot.date === day.date && state.slot.time === s.time;
  return el(
    'button',
    {
      class: `slot${s.past ? ' past' : ''}`,
      type: 'button',
      'aria-pressed': String(Boolean(isSelected)),
      disabled: s.available ? null : '',
      title: s.past ? 'Ya ha pasado' : s.taken ? 'Ocupado' : 'Disponible',
      onclick: () => setState({ slot: isSelected ? null : { date: day.date, time: s.time } }),
    },
    s.time,
  );
}

function renderSlots() {
  const day = state.week.days.find((d) => d.date === state.day);
  const groups = state.week.ranges.map((range) => {
    const inRange = day.slots.filter((s) => s.time >= range.start && s.time < range.end);
    return el(
      'div',
      { class: 'slot-group' },
      el('h4', {}, `${range.label} · ${range.start}–${range.end}`),
      el('div', { class: 'slots' }, inRange.map((s) => slotButton(day, s))),
    );
  });
  $('slot-groups').replaceChildren(...groups);
}

function renderConfirm() {
  const { slot, booking } = state;
  $('confirm-when').textContent = slot
    ? capitalize(`${formatLong(slot.date)} · ${slot.time}`)
    : 'Selecciona una franja azul';
  $('btn-confirmar').disabled = !slot || booking;
  $('btn-confirmar').textContent = booking ? 'Confirmando…' : 'Confirmar cita';
}

function render() {
  if (!state.week) return;
  renderWeekNav();
  renderDayTabs();
  renderSlots();
  renderConfirm();
}

/* ---------- Acciones ---------- */

function showError(message) {
  const box = $('form-error');
  box.textContent = message;
  box.classList.toggle('hidden', !message);
}

function describeDelivery(appointment, delivery) {
  const parts = [];
  if (delivery.email !== 'skipped') parts.push('email');
  if (delivery.sms !== 'skipped') parts.push('SMS');
  const simulated = delivery.email === 'simulated' || delivery.sms === 'simulated';
  const base = `Te lo hemos enviado por ${parts.join(' y ')}.`;
  return simulated ? `${base} (Modo demo: sin proveedor configurado, el envío se registra en el servidor.)` : base;
}

async function confirmBooking() {
  const form = $('form-datos');
  const body = {
    name: form.name.value,
    email: form.email.value,
    phone: form.phone.value,
    date: state.slot.date,
    time: state.slot.time,
  };
  showError('');
  setState({ booking: true });
  try {
    const { appointment, delivery } = await api('/appointments', { method: 'POST', body });
    $('done-code').textContent = appointment.code;
    $('done-when').textContent = capitalize(`${formatLong(appointment.date)} · ${appointment.time}`);
    $('done-sent').textContent = describeDelivery(appointment, delivery);
    $('agenda').classList.add('hidden');
    $('done').classList.remove('hidden');
    $('done').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setState({ booking: false, slot: null });
  } catch (err) {
    showError(err.message);
    setState({ booking: false });
    if (err.message.includes('ocupada')) loadWeek(state.monday);
  }
}

function openAgenda() {
  $('agenda').classList.remove('hidden');
  $('done').classList.add('hidden');
  $('agenda').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => $('nombre').focus({ preventScroll: true }), 400);
}

/* ---------- Init ---------- */

async function init() {
  const config = await api('/config');
  document.querySelector('[data-school]').textContent = config.schoolName;
  const first = await api(`/slots?week=${config.today}`);
  state = {
    ...state,
    config,
    firstMonday: first.monday,
    lastMonday: addWeeks(first.monday, config.weeksAhead - 1),
  };
  await loadWeek(first.monday);

  $('btn-agendar').addEventListener('click', openAgenda);
  $('btn-otra').addEventListener('click', openAgenda);
  $('week-prev').addEventListener('click', () => loadWeek(addWeeks(state.monday, -1)));
  $('week-next').addEventListener('click', () => loadWeek(addWeeks(state.monday, 1)));
  $('btn-confirmar').addEventListener('click', confirmBooking);
  $('form-datos').addEventListener('submit', (e) => e.preventDefault());

  // Si otra familia reserva una franja de la semana visible, refrescamos.
  subscribe({
    slots: ({ date }) => {
      if (state.week && state.week.days.some((d) => d.date === date)) loadWeek(state.monday);
    },
  });
}

init().catch((err) => {
  console.error(err);
  showError('No se pudo cargar el calendario. Recarga la página.');
});
