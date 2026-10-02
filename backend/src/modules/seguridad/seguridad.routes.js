import { Router } from '../../core/router.js';
import { sendJson } from '../../core/http.js';
import { usuarioRepository } from '../usuario/usuario.repository.js';
import { verifyPassword } from '../../core/password.js';
import { generateToken } from '../../core/jwt.js';
import { unauthorized } from '../../core/httpError.js';

export const seguridadRoutes = new Router();

// POST /seguridad/login  { nombreUsuario, contrasenia } -> { token }
seguridadRoutes.post('/login', async (ctx, res) => {
  const { nombreUsuario, contrasenia } = ctx.body || {};
  const usuario = await usuarioRepository.findByNombreUsuarioRaw(nombreUsuario);

  const ok =
    usuario &&
    usuario.activo &&
    (await verifyPassword(contrasenia || '', usuario.contrasenia));

  if (!ok) {
    throw unauthorized('Credenciales incorrectas o usuario inactivo');
  }

  const token = generateToken({
    sub: usuario.nombreUsuario,
    rol: usuario.rol,
    sucursalId: usuario.sucursalId ?? null,
  });

  sendJson(res, 200, { token });
});
