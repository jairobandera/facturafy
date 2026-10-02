// Hub de WebSocket (reemplaza el broker STOMP de Spring).
// Los clientes se conectan a /ws y reciben mensajes {topic, payload} en JSON.
// El frontend filtra por "topic". Topics usados:
//   - conteo-activo
//   - conteo-finalizado
//   - conteo-producto-actualizado
import { WebSocketServer } from 'ws';

let wss = null;

/** Inicializa el servidor WebSocket sobre un servidor HTTP existente. */
export function initWebSocket(httpServer, path = '/ws') {
  wss = new WebSocketServer({ server: httpServer, path });

  wss.on('connection', (socket) => {
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.send(JSON.stringify({ topic: 'conexion', payload: { ok: true } }));
    socket.on('message', () => { /* clientes solo escuchan, no publican */ });
    socket.on('error', () => {});
  });

  // Ping periodico para descartar conexiones muertas.
  const interval = setInterval(() => {
    if (!wss) return;
    for (const socket of wss.clients) {
      if (socket.isAlive === false) { socket.terminate(); continue; }
      socket.isAlive = false;
      try { socket.ping(); } catch { /* ignore */ }
    }
  }, 30000);

  wss.on('close', () => clearInterval(interval));
  return wss;
}

/** Publica un mensaje a todos los clientes conectados en un topic dado. */
export function publish(topic, payload) {
  if (!wss) return;
  const message = JSON.stringify({ topic, payload });
  for (const socket of wss.clients) {
    if (socket.readyState === socket.OPEN) {
      try { socket.send(message); } catch { /* ignore */ }
    }
  }
}
