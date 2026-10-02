import { Router } from '../../core/router.js';
import { sendJson, sendNoContent } from '../../core/http.js';
import { usuarioService } from './usuario.service.js';

export const usuarioRoutes = new Router();

usuarioRoutes.get('/', async (ctx, res) => {
  sendJson(res, 200, await usuarioService.getAllActive());
});

usuarioRoutes.get('/all', async (ctx, res) => {
  sendJson(res, 200, await usuarioService.getAllIncludingInactive());
});

usuarioRoutes.get('/empleados', async (ctx, res) => {
  sendJson(res, 200, await usuarioService.getEmpleados());
});

usuarioRoutes.get('/:id', async (ctx, res) => {
  const usuario = await usuarioService.getById(ctx.params.id);
  usuario ? sendJson(res, 200, usuario) : sendJson(res, 404, null);
});

usuarioRoutes.post('/', async (ctx, res) => {
  sendJson(res, 201, await usuarioService.create(ctx.body));
});

usuarioRoutes.put('/:id', async (ctx, res) => {
  const updated = await usuarioService.update(ctx.params.id, ctx.body);
  updated ? sendJson(res, 200, updated) : sendJson(res, 404, null);
});

usuarioRoutes.put('/:id/reset-password', async (ctx, res) => {
  // El cuerpo puede llegar como texto plano o { newPassword }
  const newPassword = typeof ctx.body === 'string' ? ctx.body : (ctx.body.newPassword ?? ctx.body.password);
  await usuarioService.resetPassword(ctx.params.id, newPassword);
  sendJson(res, 200, null);
});

usuarioRoutes.delete('/:id', async (ctx, res) => {
  await usuarioService.deactivate(ctx.params.id);
  sendNoContent(res);
});
