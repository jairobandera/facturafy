import { query, transaction } from '../../config/db.js';
import { Router } from '../../core/router.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { badRequest, forbidden, notFound } from '../../core/httpError.js';

// Modelo de stock: el stock del producto es la verdad (lo fija el alta manual o el Excel).
// Un lote solo etiqueta una parte de ese stock:
//   stock del producto = suma de lotes activos + stock sin lote
// Solo los lotes con afecta_stock = 1 sumaron su cantidad al producto (mercaderia nueva);
// el resto describe stock que ya estaba contado.

const SELECT = `
  SELECT id, numero_lote AS numeroLote, fecha_ingreso AS fechaIngreso,
         fecha_vencimiento AS fechaVencimiento, cantidad_stock AS cantidadStock,
         activo, afecta_stock AS afectaStock, producto_id AS productoId
  FROM lote`;

function normalize(row) {
  if (!row) return row;
  return { ...row, activo: !!row.activo, afectaStock: !!row.afectaStock };
}

const LOTES_DESHABILITADOS = 'El apartado de Lotes no esta habilitado para esta sucursal';

/** El superadmin habilita el apartado de Lotes por sucursal (sucursal.usa_lotes). */
async function assertUsaLotes(sucursalId) {
  const rows = await query(`SELECT usa_lotes AS usaLotes FROM sucursal WHERE id = ?`, [sucursalId]);
  if (!rows.length) throw notFound(`Sucursal no encontrada con id: ${sucursalId}`);
  if (!rows[0].usaLotes) throw forbidden(LOTES_DESHABILITADOS);
}

/** Igual que assertUsaLotes pero llegando a la sucursal a traves del producto. */
async function assertUsaLotesPorProducto(productoId) {
  const rows = await query(
    `SELECT s.usa_lotes AS usaLotes FROM producto p JOIN sucursal s ON s.id = p.sucursal_id WHERE p.id = ?`,
    [productoId]
  );
  if (rows.length && !rows[0].usaLotes) throw forbidden(LOTES_DESHABILITADOS);
}

/** Cuanto aporta este lote al stock del producto (0 si esta inactivo o no lo afecta). */
function aporte(lote) {
  return lote.activo && lote.afectaStock ? Number(lote.cantidadStock) : 0;
}

async function validate(dto, id = null) {
  if (!dto.numeroLote) throw badRequest('El numero de lote es requerido');
  if (!dto.fechaIngreso) throw badRequest('La fecha de ingreso es requerida');
  if (dto.cantidadStock === undefined || dto.cantidadStock === null || dto.cantidadStock < 0) {
    throw badRequest('La cantidad de stock debe ser mayor o igual a 0');
  }
  if (dto.fechaVencimiento && dto.fechaVencimiento < dto.fechaIngreso) {
    throw badRequest('La fecha de vencimiento no puede ser anterior a la de ingreso');
  }
  if (!dto.productoId) throw badRequest('Debe seleccionar un producto');
  const prod = await query(`SELECT id, activo FROM producto WHERE id = ?`, [dto.productoId]);
  if (!prod.length) throw badRequest(`Producto no encontrado con id: ${dto.productoId}`);
  if (!prod[0].activo) throw badRequest(`El producto con id ${dto.productoId} no esta activo`);
  await assertUsaLotesPorProducto(dto.productoId);
  // El numero de lote lo asigna el proveedor: puede repetirse entre productos, no dentro del mismo.
  const dup = await query(
    `SELECT id FROM lote WHERE numero_lote = ? AND producto_id = ? AND id <> ?`,
    [dto.numeroLote, dto.productoId, id ?? 0]
  );
  if (dup.length) throw badRequest(`El numero de lote "${dto.numeroLote}" ya existe para este producto`);
}

export const loteService = {
  async getAllActive() { return (await query(`${SELECT} WHERE activo = 1`)).map(normalize); },
  async getAllIncludingInactive() { return (await query(SELECT)).map(normalize); },
  async getBySucursal(sucursalId) {
    await assertUsaLotes(sucursalId);
    return (await query(
      `${SELECT} WHERE producto_id IN (SELECT id FROM producto WHERE sucursal_id = ?)`, [sucursalId]
    )).map(normalize);
  },
  async getActiveBySucursal(sucursalId) {
    await assertUsaLotes(sucursalId);
    return (await query(
      `${SELECT} WHERE activo = 1 AND producto_id IN (SELECT id FROM producto WHERE sucursal_id = ?)`, [sucursalId]
    )).map(normalize);
  },
  async getById(id) {
    const r = await query(`${SELECT} WHERE id = ?`, [id]);
    return normalize(r[0] || null);
  },

  /** Lotes con vencimiento dentro de los proximos `dias` dias (incluye los ya vencidos). */
  async getPorVencer(sucursalId, dias = 30) {
    await assertUsaLotes(sucursalId);
    // Entero saneado: se interpola porque INTERVAL no acepta placeholder preparado.
    const limite = Number.isFinite(Number(dias)) ? Math.max(0, Math.trunc(Number(dias))) : 30;
    const rows = await query(
      `SELECT l.id, l.numero_lote AS numeroLote, l.fecha_ingreso AS fechaIngreso,
              l.fecha_vencimiento AS fechaVencimiento, l.cantidad_stock AS cantidadStock,
              l.activo, l.afecta_stock AS afectaStock, l.producto_id AS productoId,
              p.nombre AS productoNombre, p.codigo_producto AS codigoProducto,
              DATEDIFF(l.fecha_vencimiento, CURDATE()) AS diasRestantes
         FROM lote l
         JOIN producto p ON p.id = l.producto_id
        WHERE l.activo = 1 AND p.sucursal_id = ?
          AND l.fecha_vencimiento IS NOT NULL
          AND l.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL ${limite} DAY)
        ORDER BY l.fecha_vencimiento ASC`,
      [sucursalId]
    );
    return rows.map(normalize);
  },

  /** Una fila por producto con lotes: stock del producto vs stock cubierto por lotes. */
  async getResumenPorProducto(sucursalId) {
    await assertUsaLotes(sucursalId);
    const rows = await query(
      `SELECT p.id AS productoId, p.codigo_producto AS codigoProducto, p.nombre AS nombre,
              p.cantidad_stock AS stockProducto,
              COALESCE(SUM(l.cantidad_stock), 0) AS stockEnLotes,
              p.cantidad_stock - COALESCE(SUM(l.cantidad_stock), 0) AS stockSinLote,
              COUNT(l.id) AS cantidadLotes,
              MIN(l.fecha_vencimiento) AS proximoVencimiento
         FROM producto p
         JOIN lote l ON l.producto_id = p.id AND l.activo = 1
        WHERE p.sucursal_id = ?
        GROUP BY p.id, p.codigo_producto, p.nombre, p.cantidad_stock
        ORDER BY stockSinLote ASC, p.nombre ASC`,
      [sucursalId]
    );
    return rows.map((r) => ({
      ...r,
      stockProducto: Number(r.stockProducto),
      stockEnLotes: Number(r.stockEnLotes),
      stockSinLote: Number(r.stockSinLote),
      cantidadLotes: Number(r.cantidadLotes),
    }));
  },

  /** Iguala el stock del producto a la suma de sus lotes activos (resuelve un descuadre). */
  async ajustarStockAlDeLotes(productoId) {
    if (!productoId) throw badRequest('Debe indicar el producto');
    await assertUsaLotesPorProducto(productoId);
    return transaction(async (conn) => {
      const [prod] = await conn.execute(
        `SELECT id, cantidad_stock FROM producto WHERE id = ? FOR UPDATE`, [productoId]
      );
      if (!prod.length) throw notFound(`Producto no encontrado con id: ${productoId}`);
      const [sum] = await conn.execute(
        `SELECT COALESCE(SUM(cantidad_stock), 0) AS total FROM lote WHERE producto_id = ? AND activo = 1`,
        [productoId]
      );
      const total = Number(sum[0].total);
      await conn.execute(`UPDATE producto SET cantidad_stock = ? WHERE id = ?`, [total, productoId]);
      return { productoId: Number(productoId), stockAnterior: Number(prod[0].cantidad_stock), stockNuevo: total };
    });
  },

  async create(dto) {
    const afectaStock = !!dto.afectaStock;
    await validate(dto);
    const id = await transaction(async (conn) => {
      const [res] = await conn.execute(
        `INSERT INTO lote (numero_lote, fecha_ingreso, fecha_vencimiento, cantidad_stock, activo, afecta_stock, producto_id)
         VALUES (?,?,?,?,1,?,?)`,
        [dto.numeroLote, dto.fechaIngreso, dto.fechaVencimiento ?? null, dto.cantidadStock,
          afectaStock ? 1 : 0, dto.productoId]
      );
      // Solo suma al producto si es mercaderia nueva que todavia no estaba en el stock.
      if (afectaStock) await adjustStock(conn, dto.productoId, dto.cantidadStock);
      return res.insertId;
    });
    return this.getById(id);
  },

  async update(id, dto) {
    const existing = normalize((await query(`${SELECT} WHERE id = ?`, [id]))[0]);
    if (!existing) return null;

    // Merge: lo que no venga en el dto conserva el valor actual. Un fechaVencimiento
    // null explicito si borra la fecha; su ausencia no (era el bug anterior).
    const merged = {
      numeroLote: dto.numeroLote ?? existing.numeroLote,
      fechaIngreso: dto.fechaIngreso ?? existing.fechaIngreso,
      fechaVencimiento: dto.fechaVencimiento !== undefined ? dto.fechaVencimiento : existing.fechaVencimiento,
      cantidadStock: dto.cantidadStock ?? existing.cantidadStock,
      productoId: Number(dto.productoId ?? existing.productoId),
      afectaStock: dto.afectaStock !== undefined ? !!dto.afectaStock : existing.afectaStock,
      activo: dto.activo !== undefined ? !!dto.activo : existing.activo,
    };
    await validate(merged, Number(id));

    await transaction(async (conn) => {
      // El aporte al stock depende de cantidad + afectaStock + activo, asi que se
      // revierte el aporte viejo y se aplica el nuevo (en el producto que corresponda).
      const viejo = aporte(existing);
      const nuevo = aporte(merged);
      if (merged.productoId !== Number(existing.productoId)) {
        if (viejo) await adjustStock(conn, existing.productoId, -viejo);
        if (nuevo) await adjustStock(conn, merged.productoId, nuevo);
      } else if (nuevo !== viejo) {
        await adjustStock(conn, merged.productoId, nuevo - viejo);
      }
      await conn.execute(
        `UPDATE lote SET numero_lote = ?, fecha_ingreso = ?, fecha_vencimiento = ?, cantidad_stock = ?,
                         activo = ?, afecta_stock = ?, producto_id = ?
         WHERE id = ?`,
        [merged.numeroLote, merged.fechaIngreso, merged.fechaVencimiento ?? null, merged.cantidadStock,
          merged.activo ? 1 : 0, merged.afectaStock ? 1 : 0, merged.productoId, id]
      );
    });
    return this.getById(id);
  },

  async deactivate(id) {
    const existing = normalize((await query(`${SELECT} WHERE id = ?`, [id]))[0]);
    if (!existing) throw notFound(`Lote no encontrado con id: ${id}`);
    await assertUsaLotesPorProducto(existing.productoId);
    if (!existing.activo) throw badRequest('El lote ya esta inactivo');
    await transaction(async (conn) => {
      // Solo devuelve stock el lote que lo habia sumado.
      const devuelve = aporte(existing);
      if (devuelve) await adjustStock(conn, existing.productoId, -devuelve);
      await conn.execute(`UPDATE lote SET activo = 0 WHERE id = ?`, [id]);
    });
  },
};

async function adjustStock(conn, productoId, delta) {
  // FOR UPDATE + UPDATE relativo: evita perder ajustes concurrentes sobre el mismo producto.
  const [rows] = await conn.execute(`SELECT cantidad_stock FROM producto WHERE id = ? FOR UPDATE`, [productoId]);
  if (!rows.length) throw badRequest(`Producto no encontrado con id: ${productoId}`);
  if (Number(rows[0].cantidad_stock) + Number(delta) < 0) {
    throw badRequest('El stock del producto no puede ser negativo');
  }
  await conn.execute(`UPDATE producto SET cantidad_stock = cantidad_stock + ? WHERE id = ?`, [delta, productoId]);
}

export const loteRoutes = new Router();
loteRoutes.get('/', async (ctx, res) => sendJson(res, 200, await loteService.getAllActive()));
loteRoutes.get('/all', async (ctx, res) => sendJson(res, 200, await loteService.getAllIncludingInactive()));
loteRoutes.get('/sucursal/:sucursalId/activos', async (ctx, res) =>
  sendJson(res, 200, await loteService.getActiveBySucursal(ctx.params.sucursalId)));
loteRoutes.get('/sucursal/:sucursalId/por-vencer', async (ctx, res) =>
  sendJson(res, 200, await loteService.getPorVencer(ctx.params.sucursalId, ctx.query.dias ?? 30)));
loteRoutes.get('/sucursal/:sucursalId/resumen', async (ctx, res) =>
  sendJson(res, 200, await loteService.getResumenPorProducto(ctx.params.sucursalId)));
loteRoutes.get('/sucursal/:sucursalId', async (ctx, res) =>
  sendJson(res, 200, await loteService.getBySucursal(ctx.params.sucursalId)));
loteRoutes.post('/ajustar-stock', async (ctx, res) =>
  sendJson(res, 200, await loteService.ajustarStockAlDeLotes(ctx.body?.productoId)));
loteRoutes.get('/:id', async (ctx, res) => {
  const l = await loteService.getById(ctx.params.id);
  l ? sendJson(res, 200, l) : sendJson(res, 404, null);
});
loteRoutes.post('/', async (ctx, res) => sendJson(res, 201, await loteService.create(ctx.body)));
loteRoutes.put('/:id', async (ctx, res) => {
  const updated = await loteService.update(ctx.params.id, ctx.body);
  updated ? sendJson(res, 200, updated) : sendJson(res, 404, null);
});
loteRoutes.delete('/:id', async (ctx, res) => {
  await loteService.deactivate(ctx.params.id);
  sendNoContent(res);
});
