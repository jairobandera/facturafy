// Servidor de archivos estaticos simple para servir el frontend (SPA).
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Intenta servir un archivo estatico. Devuelve true si respondio.
 * Si el archivo no existe y el path no tiene extension, sirve index.html (SPA fallback).
 */
export function serveStatic(req, res, rootDir, pathname) {
  // Evita path traversal
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Prohibido');
    return true;
  }

  // Directorio -> index.html
  if (pathname === '/' || pathname === '') {
    filePath = path.join(rootDir, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return streamFile(res, filePath);
  }

  // SPA fallback: rutas sin extension -> index.html
  if (!path.extname(safePath)) {
    const indexPath = path.join(rootDir, 'index.html');
    if (fs.existsSync(indexPath)) return streamFile(res, indexPath);
  }

  return false;
}

function streamFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}
