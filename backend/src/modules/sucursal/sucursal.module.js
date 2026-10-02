import { createCrud } from '../../core/crud.js';
import { query } from '../../config/db.js';
import { sendJson } from '../../core/http.js';

export const sucursalCrud = createCrud({
  table: 'sucursal',
  entityLabel: 'Sucursal',
  fields: [
    { col: 'nombre', field: 'nombre' },
    { col: 'direccion', field: 'direccion' },
    { col: 'telefono', field: 'telefono' },
    { col: 'empresa_id', field: 'empresaId' },
    // Habilita el apartado de Lotes para los administradores de la sucursal.
    { col: 'usa_lotes', field: 'usaLotes', bool: true, default: true },
    // Paquetes contratados por la sucursal (los configura el superadmin):
    //   usaStock -> control de stock (conteos), usaFacturacion -> facturacion.
    { col: 'usa_stock', field: 'usaStock', bool: true, default: true },
    { col: 'usa_facturacion', field: 'usaFacturacion', bool: true, default: false },
  ],
});

export const sucursalService = sucursalCrud.service;

// Sucursales activas de una empresa: alimenta los selectores del admin (elegir en
// que sucursal iniciar un conteo). El extend corre antes de /:id.
export const sucursalRoutes = sucursalCrud.buildRoutes((routes, { normalize }) => {
  routes.get('/empresa/:empresaId', async (ctx, res) => {
    const rows = await query(
      `SELECT id, nombre, direccion, telefono, empresa_id AS empresaId,
              usa_lotes AS usaLotes, usa_stock AS usaStock, usa_facturacion AS usaFacturacion, activo
         FROM sucursal
        WHERE empresa_id = ? AND activo = 1
        ORDER BY nombre`,
      [ctx.params.empresaId]
    );
    sendJson(res, 200, rows.map(normalize));
  });
});
