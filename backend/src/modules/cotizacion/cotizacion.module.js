// Cotizaciones de moneda. Las carga el administrador por EMPRESA (compartidas por sus
// sucursales): compra/venta en PESOS URUGUAYOS por 1 unidad de la moneda (USD/ARS/EUR).
// - Conversor del cajero: usa la cotizacion EN VIVO (API) y, si falla, la del admin.
// - Venta cobrada en otra moneda: usa la del admin (compra) y, si falta, la de la API.
import { Router } from '../../core/router.js';
import { query } from '../../config/db.js';
import { sendJson } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';

export const MONEDAS = ['USD', 'ARS', 'EUR'];

function round4(n) { return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000; }

function nowDateTime() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

// --- Cotizacion en vivo (API gratuita sin key), cacheada 10 minutos ---
let cache = { ts: 0, rates: null };
async function live() {
  if (cache.rates && Date.now() - cache.ts < 10 * 60 * 1000) return cache.rates;
  const res = await fetch('https://open.er-api.com/v6/latest/UYU');
  const j = await res.json();
  if (j.result !== 'success' || !j.rates) throw new Error('La API de cotizaciones no está disponible');
  const rates = {};
  for (const m of MONEDAS) if (j.rates[m]) rates[m] = round4(1 / j.rates[m]); // UYU por 1 unidad
  cache = { ts: Date.now(), rates };
  return rates;
}

export const cotizacionService = {
  /** Cotizaciones manuales de la empresa como { USD:{compra,venta,actualizado}, ... }. */
  async manual(empresaId) {
    const rows = await query(
      `SELECT moneda, compra, venta, actualizado FROM cotizacion WHERE empresa_id = ?`,
      [empresaId]
    );
    const out = {};
    for (const r of rows) out[r.moneda] = { compra: Number(r.compra), venta: Number(r.venta), actualizado: r.actualizado };
    return out;
  },

  /** Upsert de una lista [{ moneda, compra, venta }]. */
  async guardarManual(empresaId, items) {
    if (!Array.isArray(items)) throw badRequest('items debe ser una lista');
    for (const it of items) {
      const moneda = String(it.moneda || '').toUpperCase();
      if (!MONEDAS.includes(moneda)) throw badRequest(`Moneda inválida: ${it.moneda}`);
      const compra = Number(it.compra) || 0;
      const venta = Number(it.venta) || 0;
      await query(
        `INSERT INTO cotizacion (empresa_id, moneda, compra, venta, actualizado)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE compra = VALUES(compra), venta = VALUES(venta), actualizado = VALUES(actualizado)`,
        [empresaId, moneda, compra, venta, nowDateTime()]
      );
    }
    return this.manual(empresaId);
  },

  /**
   * Cotizaciones para el conversor: EN VIVO y, si falla, las manuales (compra).
   * Devuelve { fuente, base:'UYU', rates:{ USD, ARS, EUR } } en UYU por 1 unidad.
   */
  async paraConversor(empresaId) {
    try {
      return { fuente: 'vivo', base: 'UYU', rates: await live() };
    } catch {
      const man = await this.manual(empresaId);
      const rates = {};
      for (const m of MONEDAS) if (man[m]?.compra) rates[m] = man[m].compra;
      return { fuente: 'manual', base: 'UYU', rates };
    }
  },

  /**
   * Cotizacion (UYU por 1 unidad) para COBRAR una venta en `moneda`: la del admin
   * (compra) y, si no está cargada, la de la API en vivo. UYU devuelve 1.
   */
  async paraVenta(empresaId, moneda) {
    const m = String(moneda || 'UYU').toUpperCase();
    if (m === 'UYU') return { cotizacion: 1, fuente: 'base' };
    if (!MONEDAS.includes(m)) throw badRequest(`Moneda inválida: ${moneda}`);
    const man = await this.manual(empresaId);
    if (man[m]?.compra > 0) return { cotizacion: man[m].compra, fuente: 'manual' };
    try {
      const rates = await live();
      if (rates[m]) return { cotizacion: rates[m], fuente: 'vivo' };
    } catch { /* sin internet y sin manual */ }
    throw badRequest(`No hay cotización para ${m}. Cargala en Configuración o verificá la conexión a internet.`);
  },
};

export const cotizacionRoutes = new Router();

cotizacionRoutes.get('/vivas', async (ctx, res) => {
  sendJson(res, 200, await cotizacionService.paraConversor(ctx.query.empresaId));
});

// Cotizacion a usar para COBRAR en una moneda (la que aplica el POS). admin, API si falta.
cotizacionRoutes.get('/venta', async (ctx, res) => {
  sendJson(res, 200, await cotizacionService.paraVenta(ctx.query.empresaId, ctx.query.moneda));
});

cotizacionRoutes.get('/empresa/:empresaId', async (ctx, res) => {
  sendJson(res, 200, await cotizacionService.manual(ctx.params.empresaId));
});

cotizacionRoutes.put('/empresa/:empresaId', async (ctx, res) => {
  const items = ctx.body?.items || ctx.body;
  sendJson(res, 200, await cotizacionService.guardarManual(ctx.params.empresaId, items));
});
