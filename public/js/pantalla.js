import { api, el, formatShort, subscribe } from './api.js';

const $ = (id) => document.getElementById(id);
const MAX_NEXT = 8;
const FLASH_MS = 4000;

let state = { config: null, queue: null, last: null, soundOn: false };
let audioCtx = null;

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

/* ---------- Sonido y voz ---------- */

function chime() {
  if (!audioCtx) return;
  const notes = [880, 1174.66];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = audioCtx.currentTime + i * 0.22;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.55);
  });
}

function speak(appointment) {
  if (!state.soundOn || !('speechSynthesis' in window)) return;
  const spelled = appointment.code.split('').join(' ');
  const msg = new SpeechSynthesisUtterance(`Turno ${spelled}, puesto ${appointment.station}`);
  msg.lang = 'es-ES';
  msg.rate = 0.9;
  window.speechSynthesis.cancel();
  setTimeout(() => window.speechSynthesis.speak(msg), 600);
}

function enableSound() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  $('btn-sound').classList.add('on');
  setState({ soundOn: true });
  chime();
}

/* ---------- Render ---------- */

function renderLast() {
  const { last } = state;
  $('last-code').textContent = last ? last.code : '—';
  const station = $('last-station');
  station.replaceChildren();
  if (last) {
    station.append(`Puesto ${last.station}`, el('small', {}, 'Acérquese al puesto indicado'));
  } else {
    station.append('Espere a que aparezca su código');
  }
}

function renderStations() {
  $('stations').replaceChildren(
    ...state.queue.stations.map((s) =>
      el(
        'div',
        { class: `station${s.current ? ' active' : ''}` },
        el(
          'div',
          {},
          el('div', { class: 'name' }, `Puesto ${s.station}`),
          el('div', { class: 'status' }, s.current ? 'Atendiendo' : 'Disponible'),
        ),
        s.current
          ? el('div', { class: 'code' }, s.current.code)
          : el('div', { class: 'code free' }, 'libre'),
      ),
    ),
  );
}

function renderNext() {
  const items = state.queue.pending.slice(0, MAX_NEXT);
  $('next-list').replaceChildren(
    ...(items.length
      ? items.map((a) =>
          el(
            'li',
            {},
            el('span', { class: 'code' }, a.code),
            el('span', { class: 'time' }, a.date === state.queue.today ? a.time : `${formatShort(a.date)} ${a.time}`),
          ),
        )
      : [el('li', { class: 'empty' }, 'No hay más turnos pendientes')]),
  );
}

function render() {
  if (!state.queue) return;
  renderLast();
  renderStations();
  renderNext();
}

function tickClock() {
  const now = new Date();
  $('clock').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/* ---------- Eventos ---------- */

let flashTimer = null;
function onCall(appointment) {
  setState({ last: appointment });
  const box = $('last');
  box.classList.remove('flash');
  // Reinicia la animación aunque se llame al mismo código dos veces
  void box.offsetWidth;
  box.classList.add('flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => box.classList.remove('flash'), FLASH_MS);
  chime();
  speak(appointment);
}

function onQueue(queue) {
  const mostRecent = queue.called[0] || null;
  const lastStillActive = state.last && queue.called.some((a) => a.id === state.last.id);
  setState({ queue, last: lastStillActive ? state.last : mostRecent });
}

/* ---------- Init ---------- */

async function init() {
  const config = await api('/config');
  document.querySelector('[data-school]').textContent = config.schoolName;
  const queue = await api('/queue');
  setState({ config, queue, last: queue.called[0] || null });

  tickClock();
  setInterval(tickClock, 10_000);
  $('btn-sound').addEventListener('click', enableSound);

  subscribe({ queue: onQueue, call: onCall });
}

init().catch((err) => {
  console.error(err);
  $('last-station').textContent = 'Sin conexión con el servidor';
});
