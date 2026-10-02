import { Router } from '../../core/router.js';
import { sendJson } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';
import { ventaService } from './venta.service.js';

export const ventaRoutes = new Router();

// Ventas de una sucursal (historial para el administrador). Filtros: ?desde=&hasta=&estado=
ventaRoutes.get('/sucursal/:sucursalId', async (ctx, res) => {
  sendJson(res, 200, await ventaService.getBySucursal(ctx.params.sucursalId, {
    desde: ctx.query.desde, hasta: ctx.query.hasta, estado: ctx.query.estado,
  }));
});

ventaRoutes.get('/:id', async (ctx, res) => {
  const v = await ventaService.getById(ctx.params.id);
  v ? sendJson(res, 200, v) : sendJson(res, 404, null);
});

// Registrar una venta (lo usa el cajero desde el punto de venta).
ventaRoutes.post('/', async (ctx, res) => sendJson(res, 201, await ventaService.crear(ctx.body)));

// Anular una venta: el motivo es obligatorio y devuelve el stock.
ventaRoutes.post('/:id/anular', async (ctx, res) => {
  const { motivo, usuarioId } = ctx.body || {};
  if (!motivo || !String(motivo).trim()) throw badRequest('El motivo de anulacion es obligatorio');
  sendJson(res, 200, await ventaService.anular(ctx.params.id, { motivo, usuarioId }));
});
