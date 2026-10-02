import { query } from '../../config/db.js';
import { Router } from '../../core/router.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { badRequest, notFound } from '../../core/httpError.js';
import { publish } from '../../core/ws.js';

const SELECT = `
  SELECT id, precio_actual AS precioActual, cantidad_esperada AS cantidadEsperada,
         cantidad_contada AS cantidadContada, conteo_id AS conteoId,
         producto_id AS productoId, usuario_id AS usuarioId, activo
  FROM conteo_producto`;

function normalize(row) {
  if (!row) return row;
  return { ...row, activo: !!row.activo, precioActual: row.precioActual === null ? null : Number(row.precioActual) };
}

/**
 * Un renglon solo puede sumar un producto de la misma sucursal que el conteo.
 * Sin esto se puede inyectar en un conteo ajeno un producto de la propia sucursal.
 */
async function validarPertenencia(conteoId, productoId) {
  if (!conteoId) throw badRequest('conteoId es requerido');
  if (!productoId) throw badRequest('productoId es requerido');
  const conteo = (await query(
    `SELECT id, sucursal_id AS sucursalId, activo FROM conteo WHERE id = ?`, [conteoId]
  ))[0];
  if (!conteo) throw notFound(`Conteo no encontrado: ${conteoId}`);
  if (!conteo.activo) throw badRequest('El conteo ya no esta activo');
  const producto = (await query(
    `SELECT id, sucursal_id AS sucursalId FROM producto WHERE id = ?`, [productoId]
  ))[0];
  if (!producto) throw notFound(`Producto no encontrado: ${productoId}`);
  if (conteo.sucursalId && Number(producto.sucursalId) !== Number(conteo.sucursalId)) {
    throw badRequest('El producto es de otra sucursal que la del conteo');
  }
}

export const conteoProductoService = {
  async getAllActive() { return (await query(`${SELECT} WHERE activo = 1`)).map(normalize); },
  async getAllIncludingInactive() { return (await query(SELECT)).map(normalize); },
  async getById(id) {
    const r = await query(`${SELECT} WHERE id = ? AND activo = 1`, [id]);
    return normalize(r[0] || null);
  },
  async getByConteoId(conteoId) {
    return (await query(`${SELECT} WHERE conteo_id = ?`, [conteoId])).map(normalize);
  },
  async create(dto) {
    await validarPertenencia(dto.conteoId, dto.productoId);
    const res = await query(
      `INSERT INTO conteo_producto (precio_actual, cantidad_esperada, cantidad_contada, conteo_id, producto_id, usuario_id, activo)
       VALUES (?,?,?,?,?,?,1)`,
      [dto.precioActual ?? 0, dto.cantidadEsperada ?? null, dto.cantidadContada ?? null,
       dto.conteoId ?? null, dto.productoId ?? null, dto.usuarioId ?? null]
    );
    const r = await query(`${SELECT} WHERE id = ?`, [res.insertId]);
    const created = normalize(r[0]);
    publish('conteo-producto-actualizado', created);
    return created;
  },
  async update(id, dto, { silent = false } = {}) {
    const existing = (await query(`${SELECT} WHERE id = ?`, [id]))[0];
    if (!existing) return null;
    const sets = [];
    const params = [];
    if (dto.precioActual !== undefined && dto.precioActual !== null) { sets.push('precio_actual = ?'); params.push(dto.precioActual); }
    if (dto.cantidadEsperada !== undefined && dto.cantidadEsperada !== null) { sets.push('cantidad_esperada = ?'); params.push(dto.cantidadEsperada); }
    if (dto.cantidadContada !== undefined) { sets.push('cantidad_contada = ?'); params.push(dto.cantidadContada); }
    if (dto.usuarioId !== undefined && dto.usuarioId !== null) { sets.push('usuario_id = ?'); params.push(dto.usuarioId); }
    if (dto.conteoId !== undefined && dto.conteoId !== null) { sets.push('conteo_id = ?'); params.push(dto.conteoId); }
    if (dto.productoId !== undefined && dto.productoId !== null) { sets.push('producto_id = ?'); params.push(dto.productoId); }
    if (dto.activo !== undefined && dto.activo !== null) { sets.push('activo = ?'); params.push(dto.activo ? 1 : 0); }
    if (sets.length) await query(`UPDATE conteo_producto SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    const r = await query(`${SELECT} WHERE id = ?`, [id]);
    const updated = normalize(r[0]);
    if (!silent) publish('conteo-producto-actualizado', updated);
    return updated;
  },
  async batchUpdate(dtos) {
    const updated = [];
    for (const dto of dtos) {
      const item = await this.update(dto.id, dto, { silent: true });
      if (!item) throw notFound(`ConteoProducto no encontrado con id: ${dto.id}`);
      updated.push(item);
    }
    for (const item of updated) publish('conteo-producto-actualizado', item);
    return updated;
  },
  async deactivate(id) {
    const existing = (await query(`${SELECT} WHERE id = ?`, [id]))[0];
    if (!existing) throw notFound(`ConteoProducto no encontrado con id: ${id}`);
    await query(`UPDATE conteo_producto SET activo = 0 WHERE id = ?`, [id]);
  },
};

export const conteoProductoRoutes = new Router();
conteoProductoRoutes.get('/', async (ctx, res) => sendJson(res, 200, await conteoProductoService.getAllActive()));
conteoProductoRoutes.get('/all', async (ctx, res) => sendJson(res, 200, await conteoProductoService.getAllIncludingInactive()));

// Renglones de un conteo, SOLO si el conteo esta inactivo (finalizado) -> para reporte
conteoProductoRoutes.get('/conteo/:conteoId', async (ctx, res) => {
  const conteo = (await query(`SELECT activo FROM conteo WHERE id = ?`, [ctx.params.conteoId]))[0];
  if (!conteo) throw notFound(`Conteo no encontrado con id: ${ctx.params.conteoId}`);
  if (conteo.activo) throw badRequest('El reporte solo esta disponible para conteos inactivos.');
  sendJson(res, 200, await conteoProductoService.getByConteoId(ctx.params.conteoId));
});

// Renglones de un conteo (cualquier estado)
conteoProductoRoutes.get('/conteo-productos/:conteoId', async (ctx, res) => {
  const conteo = (await query(`SELECT id FROM conteo WHERE id = ?`, [ctx.params.conteoId]))[0];
  if (!conteo) throw notFound(`Conteo no encontrado con id: ${ctx.params.conteoId}`);
  sendJson(res, 200, await conteoProductoService.getByConteoId(ctx.params.conteoId));
});

conteoProductoRoutes.post('/batch-update', async (ctx, res) =>
  sendJson(res, 200, await conteoProductoService.batchUpdate(ctx.body)));

conteoProductoRoutes.get('/:id', async (ctx, res) => {
  const cp = await conteoProductoService.getById(ctx.params.id);
  cp ? sendJson(res, 200, cp) : sendJson(res, 404, null);
});
conteoProductoRoutes.post('/', async (ctx, res) => sendJson(res, 201, await conteoProductoService.create(ctx.body)));
conteoProductoRoutes.put('/:id', async (ctx, res) => {
  const updated = await conteoProductoService.update(ctx.params.id, ctx.body);
  updated ? sendJson(res, 200, updated) : sendJson(res, 404, null);
});
conteoProductoRoutes.delete('/:id', async (ctx, res) => {
  await conteoProductoService.deactivate(ctx.params.id);
  sendNoContent(res);
});
