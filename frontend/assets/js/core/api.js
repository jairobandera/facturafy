// Cliente HTTP para la API. Adjunta el token JWT y maneja errores.
import { config } from './config.js';
import { auth } from './auth.js';

async function request(method, path, body, { raw = false } = {}) {
  const headers = {};
  const token = auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body !== undefined && body !== null) {
    if (raw) {
      headers['Content-Type'] = 'text/plain';
      options.body = String(body);
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const res = await fetch(`${config.apiBase}${path}`, options);

  if (res.status === 401 || res.status === 403) {
    // Token invalido o expirado -> volver al login
    if (auth.isAuthenticated() && auth.isExpired()) auth.logout();
  }

  if (res.status === 204) return null;

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Error ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return text; }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body, opts) => request('POST', path, body, opts),
  put: (path, body, opts) => request('PUT', path, body, opts),
  del: (path) => request('DELETE', path),
};
