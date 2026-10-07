// Carga de variables de entorno sin dependencias externas.
// Lee un archivo .env (si existe) y lo mezcla con process.env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

function loadDotEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // Quita comillas envolventes si las hay
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

export const config = {
  rootDir,
  port: Number(process.env.PORT || 8080),
  apiBase: process.env.API_BASE || '/Stockify/api/v1',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'facturafy',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '@TI2025',
    expirationHours: Number(process.env.JWT_EXPIRATION_HOURS || 10),
  },
  serveFrontend: String(process.env.SERVE_FRONTEND || 'true') === 'true',
  // Factura electronica de Uruguay (DGI/CFE). Hoy apagado: las ventas se registran
  // internamente. Cuando haya credenciales, poner CFE_ENABLED=true y completar el
  // proveedor en src/modules/facturacion/cfe.js (el resto ya esta preparado).
  cfe: {
    enabled: String(process.env.CFE_ENABLED || 'false') === 'true',
    provider: process.env.CFE_PROVIDER || '',
    apiUrl: process.env.CFE_API_URL || '',
    apiKey: process.env.CFE_API_KEY || '',
    rutEmisor: process.env.CFE_RUT_EMISOR || '',
    certPath: process.env.CFE_CERT_PATH || '',
  },
  // Envio de correo (SMTP) para mandar el estado de cuenta de la quincena a los
  // clientes. Si SMTP_HOST esta vacio, el envio se considera "no configurado" y la
  // API responde un error claro en vez de intentar conectar.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  },
};
