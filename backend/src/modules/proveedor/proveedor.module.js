import { query } from '../../config/db.js';
import { Router } from '../../core/router.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { buildSet, toBool } from '../../core/sql.js';
import { badRequest, notFound } from '../../core/httpError.js';

const SELECT = `
  SELECT id, rut, nombre, direccion, telefono,
         nombre_vendedor AS nombreVendedor, activo
  FROM proveedor`;

function normalize(row, productoIds = []) {
  if (!row) return row;
  return { ...row, activo: !!row.activo, productoIds };
}

async function attachProductoIds(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const links = await query(
    `SELECT producto_id AS productoId, proveedor_id AS proveedorId
     FROM producto_proveedor WHERE proveedor_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const byProv = new Map();
  for (const l of links) {
    if (!byProv.has(l.proveedorId)) byProv.set(l.proveedorId, []);
    byProv.get(l.proveedorId).push(l.productoId);
  }
  return rows.map((r) => normalize(r, byProv.get(r.id) || []));
}

export const proveedorRepository = {
  async findAllActive() { return attachProductoIds(await query(`${SELECT} WHERE activo = 1`)); },
  async findAll() { return attachProductoIds(await query(SELECT)); },
  async findByIdActive(id) {
    const rows = await query(`${SELECT} WHERE id = ? AND activo = 1`, [id]);
    return (await attachProductoIds(rows))[0] || null;
  },
  async findByIdRaw(id) {
    const rows = await query(`${SELECT} WHERE id = ?`, [id]);
    return rows[0] || null;
  },
  async findByNombreActive(nombre) {
    const rows = await query(`${SELECT} WHERE LOWER(nombre) = LOWER(?) AND activo = 1`, [nombre]);
    return (await attachProductoIds(rows))[0] || null;
  },
  async findBySucursal(sucursalId, onlyActive) {
    const rows = await query(
      `${SELECT} WHERE id IN (
         SELECT DISTINCT pp.proveedor_id FROM producto_proveedor pp
         JOIN producto p ON p.id = pp.producto_id
         WHERE p.sucursal_id = ?
       ) ${onlyActive ? 'AND activo = 1' : ''}`,
      [sucursalId]
    );
    return attachProductoIds(rows);
  },
  async insert(dto) {
    const res = await query(
      `INSERT INTO proveedor (rut, nombre, direccion, telefono, nombre_vendedor, activo)
       VALUES (?,?,?,?,?,1)`,
      [dto.rut, dto.nombre, dto.direccion ?? null, dto.telefono ?? null, dto.nombreVendedor ?? null]
    );
    return res.insertId;
  },
  async updateFields(id, assignments) {
    const { clause, params } = buildSet(assignments);
    if (clause) await query(`UPDATE proveedor SET ${clause} WHERE id = ?`, [...params, id]);
  },
  async setProductos(proveedorId, productoIds) {
    await query(`DELETE FROM producto_proveedor WHERE proveedor_id = ?`, [proveedorId]);
    for (const productoId of productoIds) {
      const activos = await query(`SELECT id FROM producto WHERE id = ? AND activo = 1`, [productoId]);
      if (activos.length === 0) throw notFound(`Producto no encontrado con id: ${productoId}`);
      await query(
        `INSERT IGNORE INTO producto_proveedor (producto_id, proveedor_id) VALUES (?,?)`,
        [productoId, proveedorId]
      );
    }
  },
};

function validate(dto) {
  if (!dto.rut) throw badRequest('El RUT del proveedor es requerido');
  if (!dto.nombre) throw badRequest('El nombre del proveedor es requerido');
}

export const proveedorService = {
  getAllActive: () => proveedorRepository.findAllActive(),
  getAllIncludingInactive: () => proveedorRepository.findAll(),
  getById: (id) => proveedorRepository.findByIdActive(id),
  getByNombre: (nombre) => proveedorRepository.findByNombreActive(nombre),
  getBySucursalActive: (id) => proveedorRepository.findBySucursal(id, true),
  getBySucursal: (id) => proveedorRepository.findBySucursal(id, false),
  async create(dto) {
    validate(dto);
    const id = await proveedorRepository.insert(dto);
    if (dto.productoIds) await proveedorRepository.setProductos(id, dto.productoIds);
    return proveedorRepository.findByIdActive(id) ?? normalize(await proveedorRepository.findByIdRaw(id));
  },
  async update(id, dto) {
    validate(dto);
    const existing = await proveedorRepository.findByIdRaw(id);
    if (!existing) return null;
    await proveedorRepository.updateFields(id, {
      rut: dto.rut ?? undefined,
      nombre: dto.nombre ?? undefined,
      direccion: dto.direccion ?? undefined,
      telefono: dto.telefono ?? undefined,
      nombre_vendedor: dto.nombreVendedor ?? undefined,
      activo: dto.activo === undefined || dto.activo === null ? undefined : toBool(dto.activo),
    });
    if (dto.productoIds) await proveedorRepository.setProductos(id, dto.productoIds);
    const rows = await query(`${SELECT} WHERE id = ?`, [id]);
    return (await attachProductoIds(rows))[0];
  },
  async toggleActive(id, activo) {
    const existing = await proveedorRepository.findByIdRaw(id);
    if (!existing) throw notFound(`Proveedor no encontrado con id: ${id}`);
    await proveedorRepository.updateFields(id, { activo: toBool(activo) });
  },
  deactivate(id) { return this.toggleActive(id, false); },
};

export const proveedorRoutes = new Router();

proveedorRoutes.get('/', async (ctx, res) => sendJson(res, 200, await proveedorService.getAllActive()));
proveedorRoutes.get('/all', async (ctx, res) => sendJson(res, 200, await proveedorService.getAllIncludingInactive()));
proveedorRoutes.get('/sucursal/:sucursalId/activos', async (ctx, res) =>
  sendJson(res, 200, await proveedorService.getBySucursalActive(ctx.params.sucursalId)));
proveedorRoutes.get('/sucursal/:sucursalId', async (ctx, res) =>
  sendJson(res, 200, await proveedorService.getBySucursal(ctx.params.sucursalId)));
proveedorRoutes.get('/nombre/:nombre', async (ctx, res) => {
  const p = await proveedorService.getByNombre(ctx.params.nombre);
  p ? sendJson(res, 200, p) : sendJson(res, 404, null);
});
proveedorRoutes.get('/:id', async (ctx, res) => {
  const p = await proveedorService.getById(ctx.params.id);
  p ? sendJson(res, 200, p) : sendJson(res, 404, null);
});
proveedorRoutes.post('/', async (ctx, res) => sendJson(res, 201, await proveedorService.create(ctx.body)));
proveedorRoutes.put('/:id/activo/:activo', async (ctx, res) => {
  await proveedorService.toggleActive(ctx.params.id, ctx.params.activo === 'true' || ctx.params.activo === '1');
  sendNoContent(res);
});
proveedorRoutes.put('/:id', async (ctx, res) => {
  const updated = await proveedorService.update(ctx.params.id, ctx.body);
  updated ? sendJson(res, 200, updated) : sendJson(res, 404, null);
});
proveedorRoutes.delete('/:id', async (ctx, res) => {
  await proveedorService.deactivate(ctx.params.id);
  sendNoContent(res);
});
