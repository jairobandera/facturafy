// Manejador principal de peticiones HTTP: CORS, parseo, ruteo API y estaticos.
import path from 'node:path';
import { URL } from 'node:url';
import { config } from './config/env.js';
import { applyCors, sendJson, sendText, readJsonBody } from './core/http.js';
import { HttpError } from './core/httpError.js';
import { extractBearer, verifyToken } from './core/jwt.js';
import { serveStatic } from './core/static.js';
import { buildApiRouter } from './routes.js';

const apiRouter = buildApiRouter();
const frontendDir = path.resolve(config.rootDir, '..', 'frontend');

export async function handleRequest(req, res) {
  applyCors(res, req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // -------- API --------
  if (pathname.startsWith(config.apiBase)) {
    const apiPath = pathname.slice(config.apiBase.length) || '/';
    const matched = apiRouter.match(req.method, apiPath);
    if (!matched) {
      sendJson(res, 404, { error: 'Recurso no encontrado', path: pathname });
      return;
    }

    try {
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJsonBody(req) : {};

      // Autenticacion opcional: si viene token valido, lo adjuntamos al contexto.
      let user = null;
      const token = extractBearer(req);
      if (token) {
        try { user = verifyToken(token); } catch { user = null; }
      }

      const ctx = { params: matched.params, query, body, user, req };
      await matched.handler(ctx, res);
    } catch (err) {
      handleError(err, res);
    }
    return;
  }

  // -------- Health check --------
  if (pathname === '/health' || pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', service: 'stockify-backend', version: '2.0.0' });
    return;
  }

  // -------- Frontend estatico --------
  if (config.serveFrontend && req.method === 'GET') {
    const served = serveStatic(req, res, frontendDir, pathname);
    if (served) return;
  }

  sendText(res, 404, 'No encontrado');
}

function handleError(err, res) {
  if (err instanceof HttpError) {
    sendJson(res, err.status, { error: err.message, status: err.status });
    return;
  }
  // Errores de MySQL comunes -> mensajes utiles
  if (err && err.code === 'ER_DUP_ENTRY') {
    sendJson(res, 400, { error: 'Registro duplicado (valor unico ya existe)', detail: err.sqlMessage });
    return;
  }
  console.error('[ERROR]', err);
  sendJson(res, 500, { error: 'Error interno del servidor', detail: err?.message });
}
