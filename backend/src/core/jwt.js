// Implementacion JWT (HS256) usando solo el modulo crypto nativo de Node.
// Reemplaza a la libreria jjwt del backend Java.
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { unauthorized, forbidden } from './httpError.js';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlJson(obj) {
  return base64url(JSON.stringify(obj));
}

function sign(data, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Genera un token JWT.
 * @param {object} payload  Claims a incluir (ej: sub, rol, sucursalId)
 */
export function generateToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: nowSec,
    exp: nowSec + config.jwt.expirationHours * 3600,
  };
  const headerPart = base64urlJson(header);
  const payloadPart = base64urlJson(fullPayload);
  const signature = sign(`${headerPart}.${payloadPart}`, config.jwt.secret);
  return `${headerPart}.${payloadPart}.${signature}`;
}

/**
 * Verifica y decodifica un token. Lanza HttpError(403) si es invalido/expirado.
 */
export function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw forbidden('Token malformado');
  const [headerPart, payloadPart, signature] = parts;
  const expected = sign(`${headerPart}.${payloadPart}`, config.jwt.secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw forbidden('Firma de token invalida');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64').toString('utf8'));
  } catch {
    throw forbidden('Token malformado');
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw forbidden('Token expirado');
  }
  return payload;
}

/** Extrae el token del header Authorization: "Bearer <token>". */
export function extractBearer(req) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length);
}
