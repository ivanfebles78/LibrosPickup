// Difusión de eventos en tiempo real mediante Server-Sent Events.

const HEARTBEAT_MS = 25_000;

export function createBroadcaster() {
  const clients = new Set();

  const safeWrite = (res, chunk) => {
    if (res.destroyed || res.writableEnded) {
      clients.delete(res);
      return;
    }
    try {
      res.write(chunk);
    } catch {
      clients.delete(res);
    }
  };

  const heartbeat = setInterval(() => {
    for (const res of clients) safeWrite(res, ': ping\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    subscribe(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      clients.add(res);
      // Un cliente que se desconecta de golpe (wifi, portátil en reposo) emite
      // 'error' en lugar de 'close'; sin oyente, Node tumbaría el proceso.
      const cleanup = () => clients.delete(res);
      req.on('close', cleanup);
      req.on('error', cleanup);
      res.on('error', cleanup);
    },
    broadcast(type, payload) {
      const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
      for (const res of clients) safeWrite(res, frame);
    },
    get size() {
      return clients.size;
    },
  };
}
