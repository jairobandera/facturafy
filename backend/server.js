// Punto de entrada: servidor HTTP nativo + WebSocket.
import http from 'node:http';
import { config } from './src/config/env.js';
import { testConnection } from './src/config/db.js';
import { handleRequest } from './src/app.js';
import { initWebSocket } from './src/core/ws.js';

async function main() {
  try {
    await testConnection();
    console.log(`✔ Conexion a MySQL "${config.db.database}" establecida.`);
  } catch (err) {
    console.error('✖ No se pudo conectar a MySQL:', err.message);
    console.error('  Revisa el archivo .env y ejecuta "npm run db:init".');
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('[FATAL]', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error interno del servidor' }));
      }
    });
  });

  initWebSocket(server, '/ws');

  server.listen(config.port, () => {
    console.log(`\n🚀 Stockify 2.0 backend escuchando en http://localhost:${config.port}`);
    console.log(`   API:       http://localhost:${config.port}${config.apiBase}`);
    console.log(`   WebSocket: ws://localhost:${config.port}/ws`);
    if (config.serveFrontend) {
      console.log(`   Frontend:  http://localhost:${config.port}/`);
    }
  });
}

main();
