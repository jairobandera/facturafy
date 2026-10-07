import { query } from '../../config/db.js';

const SELECT = `
  SELECT t.id, t.sucursal_id AS sucursalId, t.numero, t.estado,
         t.fecha_apertura AS fechaApertura, t.fecha_cierre AS fechaCierre,
         t.usuario_apertura_id AS usuarioAperturaId,
         t.usuario_responsable_id AS usuarioResponsableId,
         t.usuario_cierre_id AS usuarioCierreId,
         t.observaciones_cierre AS observacionesCierre, t.activo,
         r.nombre AS responsableNombre, r.apellido AS responsableApellido,
         a.nombre AS aperturaNombre, a.apellido AS aperturaApellido
  FROM turno t
  LEFT JOIN usuario r ON r.id = t.usuario_responsable_id
  LEFT JOIN usuario a ON a.id = t.usuario_apertura_id`;

export const NUMERO_LABEL = { 1: 'Mañana', 2: 'Tarde', 3: 'Noche', 4: 'Otro' };

export function normalizeTurno(row, participantes = []) {
  if (!row) return row;
  return {
    ...row,
    activo: !!row.activo,
    numeroLabel: NUMERO_LABEL[row.numero] || `Turno ${row.numero}`,
    participantes: participantes.map((p) => ({ ...p, esResponsable: !!p.esResponsable })),
  };
}

async function participantesDe(turnoId) {
  return query(
    `SELECT tu.usuario_id AS usuarioId, tu.es_responsable AS esResponsable,
            tu.fecha_union AS fechaUnion, u.nombre, u.apellido, u.nombre_usuario AS nombreUsuario
       FROM turno_usuario tu
       JOIN usuario u ON u.id = tu.usuario_id
      WHERE tu.turno_id = ?
      ORDER BY tu.fecha_union, tu.id`,
    [turnoId]
  );
}

export const turnoRepository = {
  /** Turno ABIERTO de una sucursal (hay a lo sumo uno a la vez), con sus participantes. */
  async findActivo(sucursalId) {
    const rows = await query(
      `${SELECT} WHERE t.sucursal_id = ? AND t.estado = 'ABIERTO' AND t.activo = 1
       ORDER BY t.id DESC LIMIT 1`,
      [sucursalId]
    );
    if (!rows.length) return null;
    return normalizeTurno(rows[0], await participantesDe(rows[0].id));
  },

  async findById(id) {
    const rows = await query(`${SELECT} WHERE t.id = ?`, [id]);
    if (!rows.length) return null;
    return normalizeTurno(rows[0], await participantesDe(rows[0].id));
  },

  /** Lista de turnos de una sucursal (historial para el admin). */
  async findBySucursal(sucursalId, { estado } = {}) {
    const params = [sucursalId];
    let where = 'WHERE t.sucursal_id = ? AND t.activo = 1';
    if (estado) { where += ' AND t.estado = ?'; params.push(estado); }
    const rows = await query(`${SELECT} ${where} ORDER BY t.fecha_apertura DESC, t.id DESC`, params);
    return rows.map((r) => normalizeTurno(r));
  },
};
