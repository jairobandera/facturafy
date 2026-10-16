// Codigos de descuento de un solo uso, por sucursal. El admin los crea; el cajero los
// aplica en el POS (un % o un monto fijo sobre el total). Solo paquete completo.
// El consumo real (marcar usado) ocurre dentro de la transaccion de la venta.
import { Router } from '../../core/router.js';
import { query } from '../../config/db.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';
import { assertUsaPromos } from '../sucursal/paquetes.js';

const TIPOS = ['PORCENTAJE', 'MONTO'];

function normCodigo(c) { return String(c ?? '').trim().toUpperCase(); }
function normFecha(v) { const s = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function estadoDe(row) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (row.usado) return 'USADO';
  if (row.fechaHasta && row.fechaHasta < hoy) return 'VENCIDO';
  if (row.fechaDesde && row.fechaDesde > hoy) return 'PROGRAMADO';
  return 'VIGENTE';
}

/** Valida una fila de codigo (lanza badRequest con el motivo si no sirve). */
function assertUsable(row) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (!row || !row.activo) throw badRequest('El código no existe o fue dado de baja');
  if (row.usado) throw badRequest('El código ya fue usado');
  if (row.fechaDesde && row.fechaDesde > hoy) throw badRequest('El código todavía no está vigente');
  if (row.fechaHasta && row.fechaHasta < hoy) throw badRequest('El código está vencido');
}

/** Monto de descuento en UYU para un subtotal dado. */
export function calcularMontoDescuento(tipo, valor, subtotal) {
  const v = Number(valor) || 0;
  if (tipo === 'PORCENTAJE') return Math.min(round2(subtotal * v / 100), subtotal);
  return Math.min(round2(v), subtotal);
}

export const descuentoCodigoService = {
  /** Lista de la sucursal (no dados de baja), con estado calculado. */
  async listar(sucursalId) {
    const rows = await query(
      `SELECT id, codigo, tipo, valor, fecha_desde AS fechaDesde, fecha_hasta AS fechaHasta,
              usado, usado_venta_id AS usadoVentaId, usado_fecha AS usadoFecha, activo
         FROM descuento_codigo WHERE sucursal_id = ? AND activo = 1
        ORDER BY usado ASC, codigo`,
      [sucursalId]
    );
    return rows.map((r) => ({
      ...r, valor: Number(r.valor), usado: !!r.usado, activo: !!r.activo, estado: estadoDe(r),
    }));
  },

  async crear(sucursalId, dto) {
    await assertUsaPromos(sucursalId);
    const codigo = normCodigo(dto?.codigo);
    const tipo = String(dto?.tipo ?? '').trim().toUpperCase();
    const valor = Number(dto?.valor);
    if (!codigo) throw badRequest('El código es obligatorio');
    if (!TIPOS.includes(tipo)) throw badRequest('Tipo inválido (PORCENTAJE o MONTO)');
    if (!Number.isFinite(valor) || valor <= 0) throw badRequest('El valor del descuento debe ser mayor a 0');
    if (tipo === 'PORCENTAJE' && valor > 100) throw badRequest('El porcentaje no puede superar 100');
    const fechaDesde = normFecha(dto?.fechaDesde);
    const fechaHasta = normFecha(dto?.fechaHasta);
    if (fechaDesde && fechaHasta && fechaHasta < fechaDesde) throw badRequest('La fecha "hasta" no puede ser anterior a "desde"');
    try {
      const r = await query(
        `INSERT INTO descuento_codigo (sucursal_id, codigo, tipo, valor, fecha_desde, fecha_hasta, activo)
         VALUES (?,?,?,?,?,?,1)`,
        [sucursalId, codigo, tipo, valor, fechaDesde, fechaHasta]
      );
      return { id: r.insertId, codigo };
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw badRequest(`Ya existe un código "${codigo}" en esta sucursal`);
      throw err;
    }
  },

  /** Preview para el POS: valida y devuelve tipo/valor (no consume). */
  async validar(sucursalId, codigo) {
    const rows = await query(
      `SELECT codigo, tipo, valor, fecha_desde AS fechaDesde, fecha_hasta AS fechaHasta, usado, activo
         FROM descuento_codigo WHERE sucursal_id = ? AND codigo = ?`,
      [sucursalId, normCodigo(codigo)]
    );
    const row = rows[0];
    if (row) { row.usado = !!row.usado; row.activo = !!row.activo; }
    assertUsable(row);
    return { codigo: row.codigo, tipo: row.tipo, valor: Number(row.valor) };
  },

  /** Baja manual (soft-delete). */
  async baja(id) {
    await query(`UPDATE descuento_codigo SET activo = 0 WHERE id = ?`, [id]);
    return { ok: true };
  },
};

/**
 * Consume un codigo dentro de la transaccion de la venta (lock FOR UPDATE). Devuelve
 * { id, codigo, tipo, valor, monto }. NO marca usado todavia (se marca con el ventaId
 * recien cuando la venta ya tiene id, via marcarUsado).
 */
export async function consumirDescuento(conn, sucursalId, codigoRaw, subtotal) {
  const codigo = normCodigo(codigoRaw);
  const [rows] = await conn.execute(
    `SELECT id, codigo, tipo, valor, fecha_desde AS fechaDesde, fecha_hasta AS fechaHasta, usado, activo
       FROM descuento_codigo WHERE sucursal_id = ? AND codigo = ? FOR UPDATE`,
    [sucursalId, codigo]
  );
  const row = rows[0];
  if (row) { row.usado = !!row.usado; row.activo = !!row.activo; }
  assertUsable(row);
  const monto = calcularMontoDescuento(row.tipo, row.valor, subtotal);
  return { id: row.id, codigo: row.codigo, tipo: row.tipo, valor: Number(row.valor), monto };
}

/** Marca el codigo como usado por una venta. */
export async function marcarUsado(conn, codigoId, ventaId, fecha) {
  await conn.execute(
    `UPDATE descuento_codigo SET usado = 1, usado_venta_id = ?, usado_fecha = ? WHERE id = ?`,
    [ventaId, fecha, codigoId]
  );
}

/** Libera el codigo de una venta anulada (vuelve a estar disponible). */
export async function liberarDescuentoDeVenta(conn, ventaId) {
  await conn.execute(
    `UPDATE descuento_codigo SET usado = 0, usado_venta_id = NULL, usado_fecha = NULL WHERE usado_venta_id = ?`,
    [ventaId]
  );
}

export const descuentoCodigoRoutes = new Router();

descuentoCodigoRoutes.get('/sucursal/:sucursalId', async (ctx, res) => {
  await assertUsaPromos(ctx.params.sucursalId);
  sendJson(res, 200, await descuentoCodigoService.listar(ctx.params.sucursalId));
});
descuentoCodigoRoutes.get('/validar/sucursal/:sucursalId', async (ctx, res) => {
  await assertUsaPromos(ctx.params.sucursalId);
  sendJson(res, 200, await descuentoCodigoService.validar(ctx.params.sucursalId, ctx.query.codigo));
});
descuentoCodigoRoutes.post('/', async (ctx, res) => {
  const { sucursalId, ...dto } = ctx.body || {};
  sendJson(res, 201, await descuentoCodigoService.crear(sucursalId, dto));
});
descuentoCodigoRoutes.delete('/:id', async (ctx, res) => {
  await descuentoCodigoService.baja(ctx.params.id);
  sendNoContent(res);
});
