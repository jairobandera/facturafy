import { query } from '../../config/db.js';
import { buildSet } from '../../core/sql.js';

// Columnas expuestas (nunca devolvemos la contrasenia hasheada).
const SELECT = `
  SELECT id, nombre, apellido, nombre_usuario AS nombreUsuario, rol,
         sucursal_id AS sucursalId,
         cuenta_en_cualquier_sucursal AS cuentaEnCualquierSucursal, activo
  FROM usuario`;

export const usuarioRepository = {
  async findAllActive() {
    return query(`${SELECT} WHERE activo = 1`);
  },
  async findAll() {
    return query(SELECT);
  },
  async findByIdActive(id) {
    const rows = await query(`${SELECT} WHERE id = ? AND activo = 1`, [id]);
    return rows[0] || null;
  },
  async findById(id) {
    const rows = await query(`${SELECT} WHERE id = ?`, [id]);
    return rows[0] || null;
  },
  async findEmpleados() {
    return query(`${SELECT} WHERE rol = 'EMPLEADO'`);
  },
  /** Devuelve la fila completa (incluye contrasenia) para autenticacion. */
  async findByNombreUsuarioRaw(nombreUsuario) {
    const rows = await query(
      `SELECT id, nombre, apellido, nombre_usuario AS nombreUsuario, contrasenia, rol,
              sucursal_id AS sucursalId,
              cuenta_en_cualquier_sucursal AS cuentaEnCualquierSucursal, activo
       FROM usuario WHERE nombre_usuario = ?`,
      [nombreUsuario]
    );
    return rows[0] || null;
  },
  async insert(data) {
    const res = await query(
      `INSERT INTO usuario (nombre, apellido, nombre_usuario, contrasenia, rol, sucursal_id,
                            cuenta_en_cualquier_sucursal, activo)
       VALUES (?,?,?,?,?,?,?,1)`,
      [data.nombre, data.apellido, data.nombreUsuario, data.contrasenia, data.rol, data.sucursalId,
       data.cuentaEnCualquierSucursal ? 1 : 0]
    );
    return this.findById(res.insertId);
  },
  async updateFields(id, assignments) {
    const { clause, params } = buildSet(assignments);
    if (!clause) return this.findById(id);
    await query(`UPDATE usuario SET ${clause} WHERE id = ?`, [...params, id]);
    return this.findById(id);
  },
};
