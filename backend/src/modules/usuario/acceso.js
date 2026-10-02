// Reglas de acceso de un usuario a una sucursal. Las usan los conteos (crear,
// unirse, cargar renglones), que son el unico dominio que cruza sucursales.
//
//   SUPERADMINISTRADOR -> cualquier sucursal
//   ADMINISTRADOR      -> cualquier sucursal de SU empresa (por eso puede iniciar
//                         un conteo en el deposito y en el local)
//   EMPLEADO           -> solo la suya, salvo que tenga
//                         cuenta_en_cualquier_sucursal, que lo extiende a las de
//                         su empresa
import { query } from '../../config/db.js';
import { forbidden } from '../../core/httpError.js';

export async function puedeAccederASucursal(usuarioId, sucursalId) {
  if (!usuarioId || !sucursalId) return false;
  const rows = await query(
    `SELECT u.sucursal_id AS sucursalPropia, u.rol AS rol,
            u.cuenta_en_cualquier_sucursal AS multiSucursal,
            propia.empresa_id AS empresaPropia, destino.empresa_id AS empresaDestino
       FROM usuario u
       LEFT JOIN sucursal propia  ON propia.id = u.sucursal_id
       LEFT JOIN sucursal destino ON destino.id = ?
      WHERE u.id = ? AND u.activo = 1`,
    [sucursalId, usuarioId]
  );
  if (!rows.length) return false;
  const u = rows[0];
  if (u.rol === 'SUPERADMINISTRADOR') return true;
  if (Number(u.sucursalPropia) === Number(sucursalId)) return true;
  if (u.rol !== 'ADMINISTRADOR' && !u.multiSucursal) return false;
  // Fuera de la propia sucursal, el limite es la empresa.
  return u.empresaPropia != null && Number(u.empresaPropia) === Number(u.empresaDestino);
}

export async function assertAccesoASucursal(usuarioId, sucursalId) {
  if (!(await puedeAccederASucursal(usuarioId, sucursalId))) {
    throw forbidden('El usuario no tiene acceso a esa sucursal');
  }
}
