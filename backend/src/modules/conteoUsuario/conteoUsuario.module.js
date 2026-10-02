import { query } from '../../config/db.js';
import { Router } from '../../core/router.js';
import { sendJson } from '../../core/http.js';
import { notFound, conflict } from '../../core/httpError.js';
import { assertAccesoASucursal } from '../usuario/acceso.js';

export const conteoUsuarioService = {
  async getUsuariosPorConteo(conteoId) {
    return query(
      `SELECT u.id, u.nombre, u.apellido, u.nombre_usuario AS nombreUsuario, u.rol,
              u.sucursal_id AS sucursalId, u.activo
       FROM conteo_usuario cu
       JOIN usuario u ON u.id = cu.usuario_id
       WHERE cu.conteo_id = ?`,
      [conteoId]
    ).then((rows) => rows.map((r) => ({ ...r, activo: !!r.activo })));
  },
  async addParticipante(conteoId, usuarioId) {
    const exists = await query(
      `SELECT id FROM conteo_usuario WHERE conteo_id = ? AND usuario_id = ?`, [conteoId, usuarioId]
    );
    if (exists.length) throw conflict('El usuario ya esta registrado en este conteo');

    const user = (await query(`SELECT id, nombre_usuario AS nombreUsuario FROM usuario WHERE id = ? AND activo = 1`, [usuarioId]))[0];
    if (!user) throw notFound(`Usuario no encontrado: ${usuarioId}`);
    const conteo = (await query(
      `SELECT id, sucursal_id AS sucursalId FROM conteo WHERE id = ? AND activo = 1`, [conteoId]
    ))[0];
    if (!conteo) throw notFound(`Conteo no encontrado: ${conteoId}`);
    // Solo se cuenta en la sucursal propia, salvo admins (toda su empresa) y
    // empleados con cuenta_en_cualquier_sucursal.
    if (conteo.sucursalId) await assertAccesoASucursal(usuarioId, conteo.sucursalId);

    const res = await query(
      `INSERT INTO conteo_usuario (conteo_id, usuario_id) VALUES (?,?)`, [conteoId, usuarioId]
    );
    return { id: res.insertId, conteoId: Number(conteoId), usuarioId: Number(usuarioId), nombreUsuario: user.nombreUsuario };
  },
};

export const conteoUsuarioRoutes = new Router();
conteoUsuarioRoutes.get('/por-conteo/:conteoId', async (ctx, res) =>
  sendJson(res, 200, await conteoUsuarioService.getUsuariosPorConteo(ctx.params.conteoId)));
conteoUsuarioRoutes.post('/conteo/:conteoId/usuario/:usuarioId', async (ctx, res) =>
  sendJson(res, 200, await conteoUsuarioService.addParticipante(ctx.params.conteoId, ctx.params.usuarioId)));
