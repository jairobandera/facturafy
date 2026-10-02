// Resuelve el ID numerico del usuario autenticado (el token solo trae el nombre).
import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';

let cachedPerfil = null;

/**
 * Perfil completo del usuario autenticado. Siempre se busca por la sucursal DEL
 * TOKEN (la real del usuario), nunca por la que esté mirando en pantalla.
 */
export async function resolvePerfil() {
  if (cachedPerfil) return cachedPerfil;
  const nombre = auth.getUsername();
  const sucursalId = auth.getSucursalId();
  const usuarios = await api.get('/usuarios/all');
  const perfil = usuarios.find((u) => u.nombreUsuario === nombre &&
    (sucursalId == null || u.sucursalId === sucursalId));
  if (!perfil) throw new Error('No se encontró el perfil del usuario autenticado.');
  cachedPerfil = perfil;
  return cachedPerfil;
}

export async function resolveUsuarioId() {
  return (await resolvePerfil()).id;
}
