// Utilidades para leer el cuerpo de la peticion y escribir respuestas JSON.
import { config } from '../config/env.js';

const MAX_BODY = 12 * 1024 * 1024; // 12MB (las imagenes base64 pueden ser grandes)

export function applyCors(res, req) {
  const origin = config.corsOrigin === '*' ? (req.headers.origin || '*') : config.corsOrigin;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

export function sendJson(res, status, data) {
  const body = data === undefined || data === null ? '' : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

export function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

export function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/** Lee y parsea el cuerpo JSON de la peticion. Devuelve {} si esta vacio. */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Cuerpo de la peticion demasiado grande'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        // El endpoint de reset-password recibe texto plano; devolvemos el crudo.
        resolve(raw);
      }
    });
    req.on('error', reject);
  });
}
