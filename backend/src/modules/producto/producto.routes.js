import { Router } from '../../core/router.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';
import { productoService } from './producto.service.js';

export const productoRoutes = new Router();

productoRoutes.get('/', async (ctx, res) => sendJson(res, 200, await productoService.getAllActive()));
productoRoutes.get('/all', async (ctx, res) => sendJson(res, 200, await productoService.getAllIncludingInactive()));

productoRoutes.get('/sucursal/:sucursalId/activos', async (ctx, res) =>
  sendJson(res, 200, await productoService.getActiveBySucursal(ctx.params.sucursalId)));

// ---- Consulta de precios (kiosko publico, sin login) ----
// Estado (si esta habilitada + nombre de la sucursal) y consulta por codigo.
productoRoutes.get('/consulta/sucursal/:sucursalId', async (ctx, res) =>
  sendJson(res, 200, await productoService.consultaInfo(ctx.params.sucursalId)));

productoRoutes.get('/consulta/sucursal/:sucursalId/codigo/:codigo', async (ctx, res) => {
  const p = await productoService.consultaPrecio(ctx.params.sucursalId, ctx.params.codigo);
  p ? sendJson(res, 200, p) : sendJson(res, 404, null);
});

// Incluye inactivos: lo usan los reportes de conteos ya cerrados.
productoRoutes.get('/sucursal/:sucursalId', async (ctx, res) =>
  sendJson(res, 200, await productoService.getBySucursal(ctx.params.sucursalId)));

productoRoutes.get('/codigo/:codigoProducto/sucursal/:sucursalId', async (ctx, res) => {
  const p = await productoService.getByCodigoProductoAndSucursal(
    ctx.params.codigoProducto, ctx.params.sucursalId
  );
  p ? sendJson(res, 200, p) : sendJson(res, 404, null);
});

// Sin sucursal el codigo es ambiguo (el mismo puede existir en varias): devuelve
// el de menor id. Preferir siempre la variante /codigo/:codigo/sucursal/:sucursalId.
productoRoutes.get('/codigo/:codigoProducto', async (ctx, res) => {
  const p = await productoService.getByCodigoProducto(ctx.params.codigoProducto);
  p ? sendJson(res, 200, p) : sendJson(res, 404, null);
});

productoRoutes.post('/actualizar-masivo', async (ctx, res) => {
  const sucursalId = ctx.query.sucursalId;
  if (!sucursalId) throw badRequest('sucursalId es requerido');
  sendJson(res, 200, await productoService.actualizarMasivo(ctx.body, sucursalId));
});

// Importacion masiva de codigos de barra (aditiva: nunca borra).
// Body: [{ codigoProducto, codigosBarra: [] }]
productoRoutes.post('/codigos-barra', async (ctx, res) => {
  const sucursalId = ctx.query.sucursalId;
  if (!sucursalId) throw badRequest('sucursalId es requerido');
  sendJson(res, 200, await productoService.importarCodigosBarra(ctx.body, sucursalId));
});

productoRoutes.post('/:id/codigos-barra', async (ctx, res) =>
  sendJson(res, 200, await productoService.agregarCodigoBarra(ctx.params.id, ctx.body)));

// Baja logica: el codigo deja de escanear pero queda guardado.
productoRoutes.delete('/:id/codigos-barra/:codigo', async (ctx, res) =>
  sendJson(res, 200, await productoService.quitarCodigoBarra(ctx.params.id, ctx.params.codigo)));

productoRoutes.post('/crear-simples', async (ctx, res) => {
  const sucursalId = ctx.query.sucursalId;
  if (!sucursalId) throw badRequest('sucursalId es requerido');
  sendJson(res, 200, await productoService.crearSimples(ctx.body, sucursalId));
});

productoRoutes.get('/:id', async (ctx, res) => {
  const p = await productoService.getById(ctx.params.id);
  p ? sendJson(res, 200, p) : sendJson(res, 404, null);
});

productoRoutes.post('/', async (ctx, res) => sendJson(res, 201, await productoService.create(ctx.body)));
productoRoutes.put('/:id', async (ctx, res) => {
  const updated = await productoService.update(ctx.params.id, ctx.body);
  updated ? sendJson(res, 200, updated) : sendJson(res, 404, null);
});
productoRoutes.delete('/:id', async (ctx, res) => {
  await productoService.deactivate(ctx.params.id);
  sendNoContent(res);
});
