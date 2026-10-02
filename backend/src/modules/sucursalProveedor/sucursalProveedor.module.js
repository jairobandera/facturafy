import { query } from '../../config/db.js';
import { Router } from '../../core/router.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { badRequest, notFound } from '../../core/httpError.js';
import { proveedorRepository, proveedorService } from '../proveedor/proveedor.module.js';

function mapDto(row) {
  return {
    id: row.id,
    sucursalId: row.sucursalId,
    proveedorId: row.proveedorId,
    proveedorNombre: row.proveedorNombre,
    proveedorRut: row.proveedorRut,
    proveedorTelefono: row.proveedorTelefono,
    proveedorDireccion: row.proveedorDireccion,
    proveedorNombreVendedor: row.proveedorNombreVendedor,
    proveedorActivo: !!row.proveedorActivo,
  };
}

const SELECT = `
  SELECT sp.id, sp.sucursal_id AS sucursalId, sp.proveedor_id AS proveedorId,
         p.nombre AS proveedorNombre, p.rut AS proveedorRut, p.telefono AS proveedorTelefono,
         p.direccion AS proveedorDireccion, p.nombre_vendedor AS proveedorNombreVendedor,
         p.activo AS proveedorActivo
  FROM sucursal_proveedor sp
  JOIN proveedor p ON p.id = sp.proveedor_id`;

export const sucursalProveedorService = {
  async getBySucursal(sucursalId) {
    const rows = await query(`${SELECT} WHERE sp.sucursal_id = ? AND p.activo = 1`, [sucursalId]);
    return rows.map(mapDto);
  },
  async create(proveedorDto, sucursalId) {
    if (!proveedorDto.rut) throw badRequest('El RUT del proveedor es requerido');
    if (!proveedorDto.nombre) throw badRequest('El nombre del proveedor es requerido');
    const sucursal = (await query(`SELECT id FROM sucursal WHERE id = ? AND activo = 1`, [sucursalId]))[0];
    if (!sucursal) throw notFound(`Sucursal no encontrada con id: ${sucursalId}`);

    const proveedorId = await proveedorRepository.insert(proveedorDto);
    return this.link(sucursalId, proveedorId);
  },
  async updateProveedor(proveedorId, proveedorDto) {
    const updated = await proveedorService.update(proveedorId, proveedorDto);
    if (!updated) throw notFound(`Proveedor no encontrado con id: ${proveedorId}`);
    return updated;
  },
  async toggleProveedorActivo(proveedorId, activo) {
    await proveedorService.toggleActive(proveedorId, activo);
  },
  async link(sucursalId, proveedorId) {
    const sucursal = (await query(`SELECT id FROM sucursal WHERE id = ? AND activo = 1`, [sucursalId]))[0];
    if (!sucursal) throw notFound(`Sucursal no encontrada con id: ${sucursalId}`);
    const proveedor = (await query(`SELECT id FROM proveedor WHERE id = ? AND activo = 1`, [proveedorId]))[0];
    if (!proveedor) throw notFound(`Proveedor no encontrado con id: ${proveedorId}`);
    const existing = await query(
      `SELECT id FROM sucursal_proveedor WHERE sucursal_id = ? AND proveedor_id = ?`, [sucursalId, proveedorId]
    );
    if (existing.length) throw badRequest('La relacion Sucursal-Proveedor ya existe');
    const res = await query(
      `INSERT INTO sucursal_proveedor (sucursal_id, proveedor_id) VALUES (?,?)`, [sucursalId, proveedorId]
    );
    const rows = await query(`${SELECT} WHERE sp.id = ?`, [res.insertId]);
    return mapDto(rows[0]);
  },
};

export const sucursalProveedorRoutes = new Router();
sucursalProveedorRoutes.get('/sucursal/:sucursalId', async (ctx, res) =>
  sendJson(res, 200, await sucursalProveedorService.getBySucursal(ctx.params.sucursalId)));
sucursalProveedorRoutes.post('/sucursal/:sucursalId/proveedor/:proveedorId', async (ctx, res) =>
  sendJson(res, 201, await sucursalProveedorService.link(ctx.params.sucursalId, ctx.params.proveedorId)));
sucursalProveedorRoutes.post('/sucursal/:sucursalId', async (ctx, res) =>
  sendJson(res, 201, await sucursalProveedorService.create(ctx.body, ctx.params.sucursalId)));
sucursalProveedorRoutes.put('/proveedor/:proveedorId/activo/:activo', async (ctx, res) => {
  await sucursalProveedorService.toggleProveedorActivo(ctx.params.proveedorId, ctx.params.activo === 'true' || ctx.params.activo === '1');
  sendNoContent(res);
});
sucursalProveedorRoutes.put('/proveedor/:proveedorId', async (ctx, res) =>
  sendJson(res, 200, await sucursalProveedorService.updateProveedor(ctx.params.proveedorId, ctx.body)));
