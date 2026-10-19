// Estado de la suscripcion de la empresa del usuario logueado. El backend aplica el
// bloqueo real (402); esto es para la pantalla de bloqueo y los avisos del front.
import { api } from './api.js';

let estado = null; // { activa, bloqueada, rol, ilimitada, enPrueba, vigenteHasta, diasRestantes, horasRestantes, superadmin? }

const AVISO_KEY = 'stockify_aviso_suscripcion';

/** Carga el estado de suscripcion. Ante error, no bloquea (deja pasar). */
export async function cargarSuscripcion() {
  try { estado = await api.get('/suscripcion/estado'); }
  catch { estado = { activa: true, bloqueada: false }; }
  return estado;
}

export function limpiarSuscripcion() {
  estado = null;
  try { sessionStorage.removeItem(AVISO_KEY); } catch { /* ignore */ }
}

export function suscripcionEstado() { return estado; }

/** ¿Hay que bloquear al usuario? (el superadmin nunca se bloquea). */
export function suscripcionBloqueada() {
  if (!estado || estado.superadmin) return false;
  return estado.bloqueada === true;
}

/** Texto corto del tiempo restante para mostrar en la UI (o null si ilimitada/superadmin). */
export function suscripcionRestanteTexto() {
  if (!estado || estado.superadmin || estado.ilimitada) return null;
  if (estado.bloqueada) return 'Suscripción vencida';
  const h = estado.horasRestantes;
  if (h == null) return null;
  if (h <= 48) return `Vence en ${h} h`;
  return `Vencimiento en ${estado.diasRestantes} día${estado.diasRestantes === 1 ? '' : 's'}`;
}

/**
 * Aviso al administrador cuando le quedan <=24 h. Se muestra una vez por sesion
 * (al loguearse / al cargar la app).
 */
export function avisarVencimientoSiCorresponde() {
  if (!estado || estado.superadmin || estado.ilimitada || estado.bloqueada) return;
  if (estado.rol !== 'ADMINISTRADOR') return;
  if (estado.horasRestantes == null || estado.horasRestantes > 24) return;
  try { if (sessionStorage.getItem(AVISO_KEY)) return; sessionStorage.setItem(AVISO_KEY, '1'); } catch { /* ignore */ }
  const Swal = window.Swal;
  if (!Swal) return;
  Swal.fire({
    icon: 'warning',
    title: 'Tu suscripción está por vencer',
    html: `Te queda${estado.horasRestantes === 1 ? '' : 'n'} <b>${estado.horasRestantes} hora${estado.horasRestantes === 1 ? '' : 's'}</b> de uso.`
      + '<br>Pedí la clave de activación al proveedor e ingresala en <b>Configuración → Suscripción</b> para no quedar bloqueado.',
    confirmButtonText: 'Entendido', confirmButtonColor: '#2563eb',
  });
}
