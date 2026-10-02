import { query } from '../../config/db.js';
import { Router } from '../../core/router.js';
import { sendJson } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';

const BASE = `
  FROM conteo_producto cp
  JOIN conteo c   ON c.id = cp.conteo_id
  JOIN producto p ON p.id = cp.producto_id
  WHERE c.activo = 0
    AND cp.cantidad_contada IS NOT NULL
    AND p.sucursal_id = ?`;

function rango(desde, hasta) {
  return [`${desde} 00:00:00`, `${hasta} 23:59:59`];
}

function requireParams(q, keys) {
  for (const k of keys) if (!q[k]) throw badRequest(`El parametro "${k}" es requerido`);
}

export const estadisticaService = {
  async productosFaltantes(desde, hasta, sucursalId) {
    const [d, h] = rango(desde, hasta);
    return query(
      `SELECT p.id AS productoId, p.nombre AS nombreProducto,
              SUM(cp.cantidad_esperada - cp.cantidad_contada) AS cantidadFaltante
       ${BASE} AND c.fecha_hora BETWEEN ? AND ?
       AND (cp.cantidad_esperada - cp.cantidad_contada) > 0
       GROUP BY p.id, p.nombre
       ORDER BY cantidadFaltante DESC`,
      [sucursalId, d, h]
    ).then((r) => r.map((x) => ({ ...x, cantidadFaltante: Number(x.cantidadFaltante) })));
  },
  async productosSobrantes(desde, hasta, sucursalId) {
    const [d, h] = rango(desde, hasta);
    return query(
      `SELECT p.id AS productoId, p.nombre AS nombreProducto,
              SUM(cp.cantidad_contada - cp.cantidad_esperada) AS cantidadSobrante
       ${BASE} AND c.fecha_hora BETWEEN ? AND ?
       AND (cp.cantidad_contada - cp.cantidad_esperada) > 0
       GROUP BY p.id, p.nombre
       ORDER BY cantidadSobrante DESC`,
      [sucursalId, d, h]
    ).then((r) => r.map((x) => ({ ...x, cantidadSobrante: Number(x.cantidadSobrante) })));
  },
  // Agregacion por categoria (faltante o sobrante segun la expresion dada).
  async _catAgg(desde, hasta, sucursalId, expr, alias) {
    return query(
      `SELECT cat.id AS categoriaId, cat.nombre AS nombreCategoria, SUM(${expr}) AS ${alias}
       FROM conteo_producto cp
       JOIN conteo c   ON c.id = cp.conteo_id
       JOIN producto p ON p.id = cp.producto_id
       JOIN categoria cat ON cat.id = p.categoria_id
       WHERE c.activo = 0 AND cp.cantidad_contada IS NOT NULL AND p.sucursal_id = ?
         AND c.fecha_hora BETWEEN ? AND ? AND (${expr}) > 0
       GROUP BY cat.id, cat.nombre
       ORDER BY ${alias} DESC`,
      [sucursalId, `${desde} 00:00:00`, `${hasta} 23:59:59`]
    ).then((r) => r.map((x) => ({ ...x, [alias]: Number(x[alias]) })));
  },
  async dineroFaltanteMes(anio, sucursalId) {
    return query(
      `SELECT MONTH(c.fecha_hora) AS mes,
              SUM((cp.cantidad_esperada - cp.cantidad_contada) * cp.precio_actual) AS totalFaltante
       ${BASE} AND YEAR(c.fecha_hora) = ?
       AND (cp.cantidad_esperada - cp.cantidad_contada) > 0
       GROUP BY MONTH(c.fecha_hora) ORDER BY mes`,
      [sucursalId, anio]
    ).then((r) => r.map((x) => ({ mes: Number(x.mes), totalFaltante: Number(x.totalFaltante) })));
  },
  async dineroSobranteMes(anio, sucursalId) {
    return query(
      `SELECT MONTH(c.fecha_hora) AS mes,
              SUM((cp.cantidad_contada - cp.cantidad_esperada) * cp.precio_actual) AS totalSobrante
       ${BASE} AND YEAR(c.fecha_hora) = ?
       AND (cp.cantidad_contada - cp.cantidad_esperada) > 0
       GROUP BY MONTH(c.fecha_hora) ORDER BY mes`,
      [sucursalId, anio]
    ).then((r) => r.map((x) => ({ mes: Number(x.mes), totalSobrante: Number(x.totalSobrante) })));
  },
};

export const estadisticaRoutes = new Router();

estadisticaRoutes.get('/productos-faltaron', async (ctx, res) => {
  requireParams(ctx.query, ['fechaDesde', 'fechaHasta', 'sucursalId']);
  sendJson(res, 200, await estadisticaService.productosFaltantes(ctx.query.fechaDesde, ctx.query.fechaHasta, ctx.query.sucursalId));
});
estadisticaRoutes.get('/productos-sobrantes', async (ctx, res) => {
  requireParams(ctx.query, ['fechaDesde', 'fechaHasta', 'sucursalId']);
  sendJson(res, 200, await estadisticaService.productosSobrantes(ctx.query.fechaDesde, ctx.query.fechaHasta, ctx.query.sucursalId));
});
estadisticaRoutes.get('/dinero-faltante-mes', async (ctx, res) => {
  requireParams(ctx.query, ['anio', 'sucursalId']);
  sendJson(res, 200, await estadisticaService.dineroFaltanteMes(ctx.query.anio, ctx.query.sucursalId));
});
estadisticaRoutes.get('/dinero-sobrante-mes', async (ctx, res) => {
  requireParams(ctx.query, ['anio', 'sucursalId']);
  sendJson(res, 200, await estadisticaService.dineroSobranteMes(ctx.query.anio, ctx.query.sucursalId));
});
estadisticaRoutes.get('/categorias-faltantes', async (ctx, res) => {
  requireParams(ctx.query, ['fechaDesde', 'fechaHasta', 'sucursalId']);
  sendJson(res, 200, await estadisticaService._catAgg(
    ctx.query.fechaDesde, ctx.query.fechaHasta, ctx.query.sucursalId,
    'cp.cantidad_esperada - cp.cantidad_contada', 'cantidadFaltante'));
});
estadisticaRoutes.get('/categorias-sobrantes', async (ctx, res) => {
  requireParams(ctx.query, ['fechaDesde', 'fechaHasta', 'sucursalId']);
  sendJson(res, 200, await estadisticaService._catAgg(
    ctx.query.fechaDesde, ctx.query.fechaHasta, ctx.query.sucursalId,
    'cp.cantidad_contada - cp.cantidad_esperada', 'cantidadSobrante'));
});
