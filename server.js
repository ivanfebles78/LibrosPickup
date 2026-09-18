import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { CONFIG } from './src/config.js';
import { createBroadcaster } from './src/events.js';
import { createNotifier } from './src/notify.js';
import { QueueError } from './src/queue.js';
import { createRouter } from './src/routes.js';
import { assertWritable, createStore } from './src/store.js';

export function createApp(config = CONFIG, deps = {}) {
  const store = deps.store || createStore(config.dataFile);
  const broadcaster = deps.broadcaster || createBroadcaster();
  const notifier = deps.notifier || createNotifier({ schoolName: config.schoolName });

  const app = express();
  app.disable('x-powered-by');
  // Detrás del proxy de Railway/Render la IP real llega en X-Forwarded-For
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, clients: broadcaster.size }));
  app.use('/api', createRouter({ config, store, notifier, broadcaster }));
  // La pantalla del pasillo responde en /pasillo y /pantalla
  app.get(['/pasillo', '/pantalla'], (_req, res) => res.sendFile(path.join(config.publicDir, 'pantalla.html')));
  app.use(express.static(config.publicDir, { extensions: ['html'] }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof QueueError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON no válido' });
      return;
    }
    console.error('[server] Error no controlado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  assertWritable(CONFIG.dataFile);
  createApp().listen(CONFIG.port, () => {
    console.log(`Recogida de libros · ${CONFIG.schoolName}`);
    console.log(`  Padres:    http://localhost:${CONFIG.port}/`);
    console.log(`  Empleados: http://localhost:${CONFIG.port}/empleado`);
    console.log(`  Pasillo:   http://localhost:${CONFIG.port}/pasillo`);
    console.log(`  Puestos:   ${CONFIG.stations}`);
    console.log(`  Datos:     ${CONFIG.dataFile}`);
  });
}
