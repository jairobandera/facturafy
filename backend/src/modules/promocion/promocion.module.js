// Promociones: precio especial para una lista de productos, por sucursal, con vigencia.
// Solo para el paquete completo (facturacion + control de stock). Mientras la promo esta
// vigente (por fecha), cada producto de su lista se vende a `precio` en el POS; el precio
// server-side lo aplica venta.service usando `preciosVigentes`.
import { Router } from '../../core/router.js';
import { query, transaction } from '../../config/db.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { badRequest, notFound } from '../../core/httpError.js';
import { assertUsaPromos } from '../sucursal/paquetes.js';

function normFecha(v) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// Estado calculado al vuelo (la baja por fecha es automatica: no hay proceso).
function estadoDe(p) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (p.fechaHasta && p.fechaHasta < hoy) return 'VENCIDA';
  if (p.fechaDesde && p.fechaDesde > hoy) return 'PROGRAMADA';
  return 'VIGENTE';
}

async function cargarProductos(promocionIds) {
  if (!promocionIds.length) return new Map();
  const inClause = promocionIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT pp.promocion_id AS promocionId, pp.producto_id AS productoId,
            pr.nombre, pr.codigo_producto AS codigoProducto
       FROM promocion_producto pp
       JOIN producto pr ON pr.id = pp.producto_id
      WHERE pp.promocion_id IN (${inClause}) ORDER BY pr.nombre`,
    promocionIds
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.promocionId)) map.set(r.promocionId, []);
    map.get(r.promocionId).push({ productoId: r.productoId, nombre: r.nombre, codigoProducto: r.codigoProducto });
  }
  return map;
}

export const promocionService = {
  /** Promos de la sucursal (activas = no dadas de baja), con sus productos y estado. */
  async listar(sucursalId) {
    const promos = await query(
      `SELECT id, nombre, precio, fecha_desde AS fechaDesde, fecha_hasta AS fechaHasta, activo
         FROM promocion WHERE sucursal_id = ? AND activo = 1
        ORDER BY nombre`,
      [sucursalId]
    );
    const prods = await cargarProductos(promos.map((p) => p.id));
    return promos.map((p) => ({
      ...p, precio: Number(p.precio), activo: !!p.activo,
      productos: prods.get(p.id) || [], estado: estadoDe(p),
    }));
  },

  async getById(id) {
    const rows = await query(
      `SELECT id, sucursal_id AS sucursalId, nombre, precio,
              fecha_desde AS fechaDesde, fecha_hasta AS fechaHasta, activo
         FROM promocion WHERE id = ?`,
      [id]
    );
    if (!rows.length) throw notFound(`Promocion no encontrada con id: ${id}`);
    const p = rows[0];
    const prods = await cargarProductos([p.id]);
    return { ...p, precio: Number(p.precio), activo: !!p.activo, productos: prods.get(p.id) || [] };
  },

  /** Precio especial vigente HOY por producto (el menor si hay varias promos). Para el POS/venta. */
  async preciosVigentes(sucursalId) {
    const rows = await query(
      `SELECT pp.producto_id AS productoId, MIN(pr.precio) AS precio
         FROM promocion pr
         JOIN promocion_producto pp ON pp.promocion_id = pr.id
        WHERE pr.sucursal_id = ? AND pr.activo = 1
          AND (pr.fecha_desde IS NULL OR pr.fecha_desde <= CURDATE())
          AND (pr.fecha_hasta IS NULL OR pr.fecha_hasta >= CURDATE())
        GROUP BY pp.producto_id`,
      [sucursalId]
    );
    return rows.map((r) => ({ productoId: r.productoId, precio: Number(r.precio) }));
  },

  async crear(sucursalId, dto) {
    await assertUsaPromos(sucursalId);
    const nombre = String(dto?.nombre ?? '').trim();
    const precio = Number(dto?.precio);
    const productoIds = [...new Set((Array.isArray(dto?.productoIds) ? dto.productoIds : []).map(Number).filter(Boolean))];
    if (!nombre) throw badRequest('El nombre de la promoción es obligatorio');
    if (!Number.isFinite(precio) || precio < 0) throw badRequest('El precio de la promoción no es válido');
    if (!productoIds.length) throw badRequest('Agregá al menos un producto a la promoción');
    const fechaDesde = normFecha(dto?.fechaDesde);
    const fechaHasta = normFecha(dto?.fechaHasta);
    if (fechaDesde && fechaHasta && fechaHasta < fechaDesde) throw badRequest('La fecha "hasta" no puede ser anterior a "desde"');

    return transaction(async (conn) => {
      await assertProductosDeSucursal(conn, productoIds, sucursalId);
      const [res] = await conn.execute(
        `INSERT INTO promocion (sucursal_id, nombre, precio, fecha_desde, fecha_hasta, activo)
         VALUES (?,?,?,?,?,1)`,
        [sucursalId, nombre, precio, fechaDesde, fechaHasta]
      );
      const id = res.insertId;
      for (const pid of productoIds) {
        await conn.execute(`INSERT INTO promocion_producto (promocion_id, producto_id) VALUES (?,?)`, [id, pid]);
      }
      return { id };
    });
  },

  async actualizar(id, dto) {
    const actual = await promocionService.getById(id);
    await assertUsaPromos(actual.sucursalId);
    const nombre = dto?.nombre != null ? String(dto.nombre).trim() : actual.nombre;
    const precio = dto?.precio != null ? Number(dto.precio) : actual.precio;
    if (!nombre) throw badRequest('El nombre de la promoción es obligatorio');
    if (!Number.isFinite(precio) || precio < 0) throw badRequest('El precio de la promoción no es válido');
    const fechaDesde = dto?.fechaDesde !== undefined ? normFecha(dto.fechaDesde) : actual.fechaDesde;
    const fechaHasta = dto?.fechaHasta !== undefined ? normFecha(dto.fechaHasta) : actual.fechaHasta;
    if (fechaDesde && fechaHasta && fechaHasta < fechaDesde) throw badRequest('La fecha "hasta" no puede ser anterior a "desde"');
    const activo = dto?.activo != null ? (dto.activo ? 1 : 0) : (actual.activo ? 1 : 0);
    const productoIds = Array.isArray(dto?.productoIds)
      ? [...new Set(dto.productoIds.map(Number).filter(Boolean))] : null;
    if (productoIds && !productoIds.length) throw badRequest('Agregá al menos un producto a la promoción');

    await transaction(async (conn) => {
      if (productoIds) await assertProductosDeSucursal(conn, productoIds, actual.sucursalId);
      await conn.execute(
        `UPDATE promocion SET nombre = ?, precio = ?, fecha_desde = ?, fecha_hasta = ?, activo = ? WHERE id = ?`,
        [nombre, precio, fechaDesde, fechaHasta, activo, id]
      );
      if (productoIds) {
        await conn.execute(`DELETE FROM promocion_producto WHERE promocion_id = ?`, [id]);
        for (const pid of productoIds) {
          await conn.execute(`INSERT INTO promocion_producto (promocion_id, producto_id) VALUES (?,?)`, [id, pid]);
        }
      }
    });
    return promocionService.getById(id);
  },

  /** Baja manual (soft-delete). */
  async baja(id) {
    await query(`UPDATE promocion SET activo = 0 WHERE id = ?`, [id]);
    return { ok: true };
  },
};

async function assertProductosDeSucursal(conn, productoIds, sucursalId) {
  const inClause = productoIds.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT id FROM producto WHERE id IN (${inClause}) AND sucursal_id = ? AND activo = 1`,
    [...productoIds, sucursalId]
  );
  if (rows.length !== productoIds.length) {
    throw badRequest('Algún producto no pertenece a esta sucursal o no está activo');
  }
}

export const promocionRoutes = new Router();

promocionRoutes.get('/sucursal/:sucursalId', async (ctx, res) => {
  await assertUsaPromos(ctx.params.sucursalId);
  sendJson(res, 200, await promocionService.listar(ctx.params.sucursalId));
});
promocionRoutes.get('/vigentes/sucursal/:sucursalId', async (ctx, res) => {
  await assertUsaPromos(ctx.params.sucursalId);
  sendJson(res, 200, await promocionService.preciosVigentes(ctx.params.sucursalId));
});
promocionRoutes.get('/:id', async (ctx, res) => {
  sendJson(res, 200, await promocionService.getById(ctx.params.id));
});
promocionRoutes.post('/', async (ctx, res) => {
  const { sucursalId, ...dto } = ctx.body || {};
  sendJson(res, 201, await promocionService.crear(sucursalId, dto));
});
promocionRoutes.put('/:id', async (ctx, res) => {
  sendJson(res, 200, await promocionService.actualizar(ctx.params.id, ctx.body || {}));
});
promocionRoutes.delete('/:id', async (ctx, res) => {
  await promocionService.baja(ctx.params.id);
  sendNoContent(res);
});
