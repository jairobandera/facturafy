// Estadisticas de facturacion. Deliberadamente separadas de las de conteo
// (estadistica.module.js): el administrador tiene dos secciones distintas.
// Solo las ventas EMITIDAS cuentan para facturacion; las ANULADAS se informan aparte.
import { query } from '../../config/db.js';
import { Router } from '../../core/router.js';
import { sendJson } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';

function requireParams(q, keys) {
  for (const k of keys) if (!q[k]) throw badRequest(`El parametro "${k}" es requerido`);
}

function rango(desde, hasta) {
  return [`${desde} 00:00:00`, `${hasta} 23:59:59`];
}

export const estadisticaVentaService = {
  // Total facturado por mes de un anio (solo ventas emitidas).
  async facturadoPorMes(anio, sucursalId) {
    return query(
      `SELECT MONTH(fecha_hora) AS mes, SUM(total) AS totalFacturado, COUNT(*) AS cantidad
         FROM venta
        WHERE estado = 'EMITIDA' AND sucursal_id = ? AND YEAR(fecha_hora) = ?
        GROUP BY MONTH(fecha_hora) ORDER BY mes`,
      [sucursalId, anio]
    ).then((r) => r.map((x) => ({
      mes: Number(x.mes), totalFacturado: Number(x.totalFacturado), cantidad: Number(x.cantidad),
    })));
  },

  // Productos mas vendidos en un rango (cantidad y monto).
  async topProductos(desde, hasta, sucursalId) {
    const [d, h] = rango(desde, hasta);
    return query(
      `SELECT vd.producto_id AS productoId, vd.nombre AS nombreProducto,
              SUM(vd.cantidad) AS cantidadVendida, SUM(vd.subtotal) AS montoVendido
         FROM venta_detalle vd
         JOIN venta v ON v.id = vd.venta_id
        WHERE v.estado = 'EMITIDA' AND v.sucursal_id = ? AND v.fecha_hora BETWEEN ? AND ?
        GROUP BY vd.producto_id, vd.nombre
        ORDER BY cantidadVendida DESC
        LIMIT 20`,
      [sucursalId, d, h]
    ).then((r) => r.map((x) => ({
      ...x, cantidadVendida: Number(x.cantidadVendida), montoVendido: Number(x.montoVendido),
    })));
  },

  // Resumen del rango: totales, contado vs credito y anuladas.
  async resumen(desde, hasta, sucursalId) {
    const [d, h] = rango(desde, hasta);
    const rows = await query(
      `SELECT
         SUM(estado = 'EMITIDA') AS ventasEmitidas,
         SUM(CASE WHEN estado = 'EMITIDA' THEN total ELSE 0 END) AS totalFacturado,
         SUM(CASE WHEN estado = 'EMITIDA' AND forma_pago = 'CONTADO' THEN total ELSE 0 END) AS totalContado,
         SUM(CASE WHEN estado = 'EMITIDA' AND forma_pago = 'CREDITO' THEN total ELSE 0 END) AS totalCredito,
         SUM(estado = 'ANULADA') AS ventasAnuladas,
         SUM(CASE WHEN estado = 'ANULADA' THEN total ELSE 0 END) AS totalAnulado
       FROM venta
      WHERE sucursal_id = ? AND fecha_hora BETWEEN ? AND ?`,
      [sucursalId, d, h]
    );
    const x = rows[0] || {};
    return {
      ventasEmitidas: Number(x.ventasEmitidas || 0),
      totalFacturado: Number(x.totalFacturado || 0),
      totalContado: Number(x.totalContado || 0),
      totalCredito: Number(x.totalCredito || 0),
      ventasAnuladas: Number(x.ventasAnuladas || 0),
      totalAnulado: Number(x.totalAnulado || 0),
    };
  },
};

export const estadisticaVentaRoutes = new Router();

estadisticaVentaRoutes.get('/facturado-mes', async (ctx, res) => {
  requireParams(ctx.query, ['anio', 'sucursalId']);
  sendJson(res, 200, await estadisticaVentaService.facturadoPorMes(ctx.query.anio, ctx.query.sucursalId));
});
estadisticaVentaRoutes.get('/top-productos', async (ctx, res) => {
  requireParams(ctx.query, ['fechaDesde', 'fechaHasta', 'sucursalId']);
  sendJson(res, 200, await estadisticaVentaService.topProductos(
    ctx.query.fechaDesde, ctx.query.fechaHasta, ctx.query.sucursalId));
});
estadisticaVentaRoutes.get('/resumen', async (ctx, res) => {
  requireParams(ctx.query, ['fechaDesde', 'fechaHasta', 'sucursalId']);
  sendJson(res, 200, await estadisticaVentaService.resumen(
    ctx.query.fechaDesde, ctx.query.fechaHasta, ctx.query.sucursalId));
});
