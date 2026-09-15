import { api, el, formatShort, subscribe } from './api.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'recogida.station';
const PIN_KEY = 'recogida.staffPin';
const UNAUTHORIZED = 'PIN de personal incorrecto';

let state = { config: null, station: null, queue: null, busy: false, pin: '' };

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

function readStoredStation(max) {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return n >= 1 && n <= max ? n : 1;
  } catch {
    return 1;
  }
}

function storeStation(n) {
  try { localStorage.setItem(STORAGE_KEY, String(n)); } catch { /* sin almacenamiento */ }
}

function readStoredPin() {
  try { return sessionStorage.getItem(PIN_KEY) || ''; } catch { return ''; }
}

function storePin(pin) {
  try { sessionStorage.setItem(PIN_KEY, pin); } catch { /* sin almacenamiento */ }
}

/** Pide el PIN del personal (solo si el servidor lo exige). */
function askPin(message = 'PIN del personal') {
  const pin = window.prompt(message) || '';
  storePin(pin);
  state = { ...state, pin };
  return pin;
}

/* ---------- Render ---------- */

function renderStationPicker() {
  const picker = $('station-picker');
  picker.replaceChildren(
    ...Array.from({ length: state.config.stations }, (_, i) => i + 1).map((n) =>
      el(
        'button',
        {
          class: 'station-btn',
          type: 'button',
          role: 'radio',
          'aria-checked': String(n === state.station),
          onclick: () => { storeStation(n); setState({ station: n }); },
        },
        `Puesto ${n}`,
      ),
    ),
  );
}

function renderNow() {
  const mine = state.queue.stations.find((s) => s.station === state.station);
  const current = mine ? mine.current : null;
  $('now-station').textContent = `puesto ${state.station}`;
  const code = $('now-code');
  code.textContent = current ? current.code : 'libre';
  code.classList.toggle('empty', !current);
  $('now-name').textContent = current
    ? current.name
    : 'Nadie en atención. Pulsa «Siguiente» para llamar al primero de la cola.';
  $('now-meta').textContent = current ? `Cita: ${dayLabel(current.date)} · ${current.time}` : '';

  const hasPending = state.queue.pending.length > 0;
  $('btn-next').disabled = state.busy || (!hasPending && !current);
  $('btn-next-label').textContent = current ? 'Finalizar y siguiente' : 'Siguiente';
  $('btn-recall').disabled = state.busy || !current;
  $('btn-done').disabled = state.busy || !current;
  $('btn-noshow').disabled = state.busy || !current;
}

function dayLabel(date) {
  return date === state.queue.today ? 'hoy' : formatShort(date);
}

function queueItem(a, nowTime) {
  const isToday = a.date === state.queue.today;
  const isLate = isToday && a.time < nowTime;
  return el(
    'li',
    { class: `queue-item${isLate ? ' late' : ''}${isToday ? '' : ' other-day'}` },
    el('span', { class: 't' }, isToday ? a.time : `${formatShort(a.date)} ${a.time}`),
    el('span', { class: 'code-chip' }, a.code),
    el('span', { class: 'n' }, a.name),
  );
}

function renderQueue() {
  const { pending, today } = state.queue;
  const todayCount = pending.filter((a) => a.date === today).length;
  $('queue-count').textContent = todayCount === pending.length
    ? String(pending.length)
    : `${todayCount} hoy · ${pending.length} en total`;
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  $('queue-list').replaceChildren(
    ...(pending.length
      ? pending.map((a) => queueItem(a, nowTime))
      : [el('li', { class: 'muted' }, 'No queda nadie pendiente.')]),
  );
}

function renderOthers() {
  $('others-list').replaceChildren(
    ...state.queue.stations.map((s) =>
      el(
        'li',
        { class: s.station === state.station ? 'me' : '' },
        el('strong', {}, `Puesto ${s.station}`),
        s.current
          ? el('span', { class: 'code-chip' }, s.current.code)
          : el('span', { class: 'free' }, 'libre'),
      ),
    ),
  );
}

function render() {
  if (!state.config || !state.queue) return;
  renderStationPicker();
  renderNow();
  renderQueue();
  renderOthers();
}

/* ---------- Acciones ---------- */

function showError(message) {
  const box = $('error');
  box.textContent = message;
  box.classList.toggle('hidden', !message);
}

async function act(path, retried = false) {
  showError('');
  setState({ busy: true });
  try {
    const headers = state.pin ? { 'X-Staff-Pin': state.pin } : {};
    await api(`/stations/${state.station}/${path}`, { method: 'POST', headers });
    const queue = await api('/queue');
    setState({ busy: false, queue });
  } catch (err) {
    setState({ busy: false });
    if (err.message === UNAUTHORIZED && !retried) {
      askPin('PIN incorrecto. Introduce el PIN del personal:');
      return act(path, true);
    }
    showError(err.message);
  }
}

function setConnection(status) {
  const conn = $('conn');
  conn.className = `conn ${status}`;
  conn.lastChild.textContent = status === 'online' ? ' en línea' : ' sin conexión';
}

/* ---------- Init ---------- */

async function init() {
  const config = await api('/config');
  document.querySelector('[data-school]').textContent = config.schoolName;
  const queue = await api('/queue');
  const pin = config.staffPinRequired ? readStoredPin() || askPin() : '';
  setState({ config, station: readStoredStation(config.stations), queue, pin });

  $('btn-next').addEventListener('click', () => act('next'));
  $('btn-recall').addEventListener('click', () => act('recall'));
  $('btn-done').addEventListener('click', () => act('done'));
  $('btn-noshow').addEventListener('click', () => act('no-show'));

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !['INPUT', 'BUTTON'].includes(e.target.tagName) && !$('btn-next').disabled) {
      e.preventDefault();
      act('next');
    }
  });

  subscribe({ queue: (q) => setState({ queue: q }) }, setConnection);
}

init().catch((err) => {
  console.error(err);
  showError('No se pudo conectar con el servidor.');
});
