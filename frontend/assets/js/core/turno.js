// Estado del turno de caja de la sucursal. Un turno es UNO por sucursal a la vez:
// mientras hay uno ABIERTO, los cajeros que entran se suman a el. El POS, Clientes y
// Ventas del turno solo operan si el cajero esta dentro de un turno abierto.
//
// A diferencia de la config de sucursal, el turno cambia durante la sesion (se abre,
// se cierra, otros se suman), asi que se consulta fresco al backend y solo se cachea
// en memoria para los guards de pagina dentro de una misma navegacion.
import { api } from './api.js';

let turnoCache = null;

/** Trae el turno ABIERTO de la sucursal (o null) y lo cachea en memoria. */
export async function cargarTurnoActivo(sucursalId) {
  turnoCache = await api.get(`/turnos/sucursal/${sucursalId}/activo`);
  return turnoCache;
}

export function turnoActivo() { return turnoCache; }

export function limpiarTurno() { turnoCache = null; }

/** ¿El usuario forma parte del turno (se unió / lo abrió)? */
export function soyMiembro(turno, usuarioId) {
  if (!turno || usuarioId == null) return false;
  return (turno.participantes || []).some((p) => Number(p.usuarioId) === Number(usuarioId));
}

/** ¿El usuario es el responsable del turno? */
export function soyResponsable(turno, usuarioId) {
  return !!turno && turno.usuarioResponsableId != null &&
    Number(turno.usuarioResponsableId) === Number(usuarioId);
}
