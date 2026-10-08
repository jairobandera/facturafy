// Guards de los paquetes contratados por sucursal (los configura el superadmin):
//   usa_stock       -> control de stock (conteos, estadisticas de conteo)
//   usa_facturacion -> facturacion (punto de venta, ventas, clientes)
// Espejo de assertUsaLotes en lote.module.js. Una empresa puede tener una sucursal
// con el paquete completo y otra con uno solo, por eso la verificacion es por sucursal.
import { query } from '../../config/db.js';
import { forbidden, notFound } from '../../core/httpError.js';

async function flagsDeSucursal(sucursalId) {
  const rows = await query(
    `SELECT usa_stock AS usaStock, usa_facturacion AS usaFacturacion,
            usa_envio_correos AS usaEnvioCorreos
       FROM sucursal WHERE id = ?`,
    [sucursalId]
  );
  if (!rows.length) throw notFound(`Sucursal no encontrada con id: ${sucursalId}`);
  return rows[0];
}

/** La sucursal debe tener habilitado el paquete de facturacion. */
export async function assertUsaFacturacion(sucursalId) {
  const flags = await flagsDeSucursal(sucursalId);
  if (!flags.usaFacturacion) {
    throw forbidden('El paquete de facturacion no esta habilitado para esta sucursal');
  }
}

/** La sucursal debe tener habilitado el paquete de control de stock. */
export async function assertUsaStock(sucursalId) {
  const flags = await flagsDeSucursal(sucursalId);
  if (!flags.usaStock) {
    throw forbidden('El paquete de control de stock no esta habilitado para esta sucursal');
  }
}

/** La sucursal debe tener habilitado el paquete de envio de correos. */
export async function assertUsaEnvioCorreos(sucursalId) {
  const flags = await flagsDeSucursal(sucursalId);
  if (!flags.usaEnvioCorreos) {
    throw forbidden('El paquete de envio de correos no esta habilitado para esta sucursal');
  }
}
