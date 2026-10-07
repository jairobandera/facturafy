import { Router } from '../../core/router.js';
import { sendJson } from '../../core/http.js';
import { badRequest } from '../../core/httpError.js';
import { turnoService } from './turno.service.js';

export const turnoRoutes = new Router();

const ROLES_ADMIN = ['ADMINISTRADOR', 'SUPERADMINISTRADOR'];

// Turno ABIERTO de una sucursal (el POS lo consulta para saber si puede operar).
// Devuelve 200 con null cuando no hay turno abierto.
turnoRoutes.get('/sucursal/:sucursalId/activo', async (ctx, res) => {
  sendJson(res, 200, await turnoService.getActivo(ctx.params.sucursalId));
});

// Historial de turnos de una sucursal (admin). Filtro opcional ?estado=ABIERTO|CERRADO
turnoRoutes.get('/sucursal/:sucursalId', async (ctx, res) => {
  sendJson(res, 200, await turnoService.getBySucursal(ctx.params.sucursalId, { estado: ctx.query.estado }));
});

// Reporte de arqueo de un turno.
turnoRoutes.get('/:id/reporte', async (ctx, res) => {
  sendJson(res, 200, await turnoService.getReporte(ctx.params.id));
});

turnoRoutes.get('/:id', async (ctx, res) => {
  const t = await turnoService.getById(ctx.params.id);
  t ? sendJson(res, 200, t) : sendJson(res, 404, null);
});

// Abrir un turno nuevo (falla si ya hay uno abierto en la sucursal).
turnoRoutes.post('/', async (ctx, res) => {
  const { sucursalId, numero, usuarioId, esResponsable } = ctx.body || {};
  sendJson(res, 201, await turnoService.abrir({ sucursalId, numero, usuarioId, esResponsable }));
});

// Sumarse a un turno abierto.
turnoRoutes.post('/:id/unirse', async (ctx, res) => {
  const { usuarioId, esResponsable } = ctx.body || {};
  sendJson(res, 200, await turnoService.unirse(ctx.params.id, { usuarioId, esResponsable }));
});

// Cerrar el turno: responsable o administrador. Devuelve el reporte de arqueo.
turnoRoutes.post('/:id/cerrar', async (ctx, res) => {
  const { usuarioId, observaciones } = ctx.body || {};
  if (!usuarioId) throw badRequest('usuarioId es requerido');
  const esAdmin = ROLES_ADMIN.includes(ctx.user?.rol);
  sendJson(res, 200, await turnoService.cerrar(ctx.params.id, { usuarioId, observaciones, esAdmin }));
});
