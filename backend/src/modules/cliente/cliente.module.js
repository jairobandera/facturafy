// Clientes de facturacion. CRUD simple con soft-delete, scoped por sucursal.
// El consumidor final NO es un cliente (la venta guarda cliente_id = NULL): aca
// solo viven los clientes con datos (RUT, razon social) para boletas/facturas.
import { createCrud } from '../../core/crud.js';
import { query } from '../../config/db.js';
import { sendJson } from '../../core/http.js';
import { assertUsaFacturacion } from '../sucursal/paquetes.js';

export const clienteCrud = createCrud({
  table: 'cliente',
  entityLabel: 'Cliente',
  fields: [
    { col: 'rut', field: 'rut' },
    { col: 'razon_social', field: 'razonSocial' },
    { col: 'nombre_fantasia', field: 'nombreFantasia' },
    { col: 'direccion', field: 'direccion' },
    { col: 'telefono', field: 'telefono' },
    { col: 'email', field: 'email' },
    { col: 'tipo_documento', field: 'tipoDocumento', default: 'RUT' },
    { col: 'sucursal_id', field: 'sucursalId' },
  ],
});

export const clienteService = clienteCrud.service;

const SELECT = `
  SELECT id, rut, razon_social AS razonSocial, nombre_fantasia AS nombreFantasia,
         direccion, telefono, email, tipo_documento AS tipoDocumento,
         sucursal_id AS sucursalId, activo
  FROM cliente`;

function normalize(row) {
  return row ? { ...row, activo: !!row.activo } : row;
}

// Las rutas literales van ANTES de /:id para no colisionar con el parametro.
export const clienteRoutes = clienteCrud.buildRoutes((routes) => {
  // Clientes activos de una sucursal (los lista el POS y la pantalla de clientes).
  routes.get('/sucursal/:sucursalId', async (ctx, res) => {
    await assertUsaFacturacion(ctx.params.sucursalId);
    const rows = await query(
      `${SELECT} WHERE sucursal_id = ? AND activo = 1 ORDER BY razon_social`,
      [ctx.params.sucursalId]
    );
    sendJson(res, 200, rows.map(normalize));
  });

  // Busqueda exacta por RUT dentro de la sucursal (el POS la usa al tipear el RUT).
  routes.get('/sucursal/:sucursalId/rut/:rut', async (ctx, res) => {
    const rows = await query(
      `${SELECT} WHERE sucursal_id = ? AND rut = ? AND activo = 1 LIMIT 1`,
      [ctx.params.sucursalId, String(ctx.params.rut).trim()]
    );
    rows.length ? sendJson(res, 200, normalize(rows[0])) : sendJson(res, 404, null);
  });
});
