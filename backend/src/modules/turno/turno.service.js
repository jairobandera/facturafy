// Turnos de caja. Un turno es UNO por sucursal a la vez: mientras hay uno ABIERTO,
// los cajeros que entran se suman a el. El responsable es el cajero que se marco como
// tal (al abrir o al sumarse). El cierre lo hace el responsable o un administrador y
// devuelve el reporte de arqueo (totales por forma de pago, ventas, anuladas).
import { query, transaction } from '../../config/db.js';
import { badRequest, notFound, forbidden } from '../../core/httpError.js';
import { assertUsaFacturacion } from '../sucursal/paquetes.js';
import { turnoRepository, NUMERO_LABEL } from './turno.repository.js';

/** Fecha y hora LOCAL del servidor en formato MySQL (igual criterio que venta/conteo). */
function nowDateTime() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

export const turnoService = {
  getActivo: (sucursalId) => turnoRepository.findActivo(sucursalId),
  getById: (id) => turnoRepository.findById(id),
  getBySucursal: (sucursalId, filtros) => turnoRepository.findBySucursal(sucursalId, filtros),

  /** Abre un turno nuevo. Falla si la sucursal ya tiene uno abierto. */
  async abrir({ sucursalId, numero, usuarioId, esResponsable }) {
    const suc = Number(sucursalId);
    if (!suc) throw badRequest('sucursalId es requerido');
    await assertUsaFacturacion(suc);
    const n = Number(numero);
    if (!NUMERO_LABEL[n]) throw badRequest('El turno debe ser 1 (mañana), 2 (tarde), 3 (noche) o 4 (otro)');
    if (!usuarioId) throw badRequest('usuarioId es requerido');

    const id = await transaction(async (conn) => {
      // Bloquea para evitar que dos cajeros abran turno a la vez en la misma sucursal.
      const [abiertos] = await conn.execute(
        `SELECT id FROM turno WHERE sucursal_id = ? AND estado = 'ABIERTO' AND activo = 1 FOR UPDATE`,
        [suc]
      );
      if (abiertos.length) {
        throw badRequest('Ya hay un turno abierto en esta sucursal. Unite a ese turno o esperá a que lo cierren.');
      }
      const ahora = nowDateTime();
      const [res] = await conn.execute(
        `INSERT INTO turno
           (sucursal_id, numero, estado, fecha_apertura, usuario_apertura_id, usuario_responsable_id, activo)
         VALUES (?,?, 'ABIERTO', ?, ?, ?, 1)`,
        [suc, n, ahora, usuarioId, esResponsable ? usuarioId : null]
      );
      const turnoId = res.insertId;
      await conn.execute(
        `INSERT INTO turno_usuario (turno_id, usuario_id, es_responsable, fecha_union) VALUES (?,?,?,?)`,
        [turnoId, usuarioId, esResponsable ? 1 : 0, ahora]
      );
      return turnoId;
    });
    return turnoRepository.findById(id);
  },

  /** Un cajero se suma a un turno abierto. Si no hay responsable y se marca, queda responsable. */
  async unirse(turnoId, { usuarioId, esResponsable }) {
    if (!usuarioId) throw badRequest('usuarioId es requerido');
    await transaction(async (conn) => {
      const [turnos] = await conn.execute(
        `SELECT id, estado, sucursal_id AS sucursalId, usuario_responsable_id AS responsableId
           FROM turno WHERE id = ? FOR UPDATE`,
        [turnoId]
      );
      if (!turnos.length) throw notFound(`Turno no encontrado con id: ${turnoId}`);
      const turno = turnos[0];
      if (turno.estado !== 'ABIERTO') throw badRequest('El turno ya está cerrado');

      const [miembros] = await conn.execute(
        `SELECT id, es_responsable AS esResponsable FROM turno_usuario WHERE turno_id = ? AND usuario_id = ?`,
        [turnoId, usuarioId]
      );
      const quiereResponsable = !!esResponsable && turno.responsableId == null;
      const ahora = nowDateTime();

      if (miembros.length) {
        // Ya estaba en el turno: solo puede pasar a ser responsable si no hay otro.
        if (quiereResponsable) {
          await conn.execute(`UPDATE turno_usuario SET es_responsable = 1 WHERE id = ?`, [miembros[0].id]);
          await conn.execute(`UPDATE turno SET usuario_responsable_id = ? WHERE id = ?`, [usuarioId, turnoId]);
        }
        return;
      }
      await conn.execute(
        `INSERT INTO turno_usuario (turno_id, usuario_id, es_responsable, fecha_union) VALUES (?,?,?,?)`,
        [turnoId, usuarioId, quiereResponsable ? 1 : 0, ahora]
      );
      if (quiereResponsable) {
        await conn.execute(`UPDATE turno SET usuario_responsable_id = ? WHERE id = ?`, [usuarioId, turnoId]);
      }
    });
    return turnoRepository.findById(turnoId);
  },

  /**
   * Cierra el turno. Solo el responsable o un administrador pueden hacerlo.
   * Devuelve el reporte de arqueo del turno.
   */
  async cerrar(turnoId, { usuarioId, observaciones, esAdmin } = {}) {
    await transaction(async (conn) => {
      const [turnos] = await conn.execute(
        `SELECT id, estado, usuario_responsable_id AS responsableId FROM turno WHERE id = ? FOR UPDATE`,
        [turnoId]
      );
      if (!turnos.length) throw notFound(`Turno no encontrado con id: ${turnoId}`);
      const turno = turnos[0];
      if (turno.estado !== 'ABIERTO') throw badRequest('El turno ya está cerrado');

      const esResponsable = turno.responsableId != null && Number(turno.responsableId) === Number(usuarioId);
      if (!esAdmin && !esResponsable) {
        throw forbidden('Solo el cajero responsable del turno o un administrador pueden cerrarlo');
      }
      await conn.execute(
        `UPDATE turno SET estado = 'CERRADO', fecha_cierre = ?, usuario_cierre_id = ?,
                          observaciones_cierre = ? WHERE id = ?`,
        [nowDateTime(), usuarioId ?? null, String(observaciones ?? '').trim() || null, turnoId]
      );
    });
    return this.getReporte(turnoId);
  },

  /**
   * Reporte de arqueo de un turno: totales por forma de pago, cantidad de ventas,
   * anuladas y participantes. Lo usa el cierre y la pantalla de ventas del turno.
   */
  async getReporte(turnoId) {
    const turno = await turnoRepository.findById(turnoId);
    if (!turno) throw notFound(`Turno no encontrado con id: ${turnoId}`);

    const rows = await query(
      `SELECT estado, forma_pago AS formaPago, COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS total
         FROM venta WHERE turno_id = ? GROUP BY estado, forma_pago`,
      [turnoId]
    );

    const resumen = {
      cantidadVentas: 0, totalVendido: 0,
      contado: { cantidad: 0, total: 0 },
      credito: { cantidad: 0, total: 0 },
      anuladas: { cantidad: 0, total: 0 },
    };
    for (const r of rows) {
      const cantidad = Number(r.cantidad);
      const total = Number(r.total);
      if (r.estado === 'ANULADA') {
        resumen.anuladas.cantidad += cantidad;
        resumen.anuladas.total += total;
        continue;
      }
      // EMITIDA
      resumen.cantidadVentas += cantidad;
      resumen.totalVendido += total;
      if (r.formaPago === 'CREDITO') { resumen.credito.cantidad += cantidad; resumen.credito.total += total; }
      else { resumen.contado.cantidad += cantidad; resumen.contado.total += total; }
    }
    return { turno, resumen };
  },
};
