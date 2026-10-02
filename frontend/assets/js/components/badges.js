import { h } from '../core/dom.js';

export function activoBadge(activo) {
  return activo
    ? h('span', { class: 'badge text-bg-success' }, 'Activo')
    : h('span', { class: 'badge text-bg-secondary' }, 'Inactivo');
}

// Cortes del semaforo de vencimientos (en dias).
export const DIAS_CRITICO = 7;
export const DIAS_PROXIMO = 30;

/**
 * Estado de vencimiento de una fecha "YYYY-MM-DD".
 * @returns {{ estado: 'sinFecha'|'vencido'|'critico'|'proximo'|'ok', dias: number|null }}
 */
export function estadoVencimiento(fechaVencimiento) {
  if (!fechaVencimiento) return { estado: 'sinFecha', dias: null };
  const [y, m, d] = String(fechaVencimiento).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return { estado: 'sinFecha', dias: null };
  const hoy = new Date();
  const dias = Math.round(
    (new Date(y, m - 1, d) - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000
  );
  if (dias < 0) return { estado: 'vencido', dias };
  if (dias <= DIAS_CRITICO) return { estado: 'critico', dias };
  if (dias <= DIAS_PROXIMO) return { estado: 'proximo', dias };
  return { estado: 'ok', dias };
}

const VENCIMIENTO_BADGES = {
  sinFecha: { class: 'text-bg-secondary', texto: () => 'Sin vencimiento' },
  vencido: { class: 'text-bg-danger', texto: (d) => `Vencido hace ${Math.abs(d)} d` },
  critico: { class: 'text-bg-warning', texto: (d) => (d === 0 ? 'Vence hoy' : `Vence en ${d} d`) },
  proximo: { class: 'text-bg-info', texto: (d) => `Vence en ${d} d` },
  ok: { class: 'text-bg-success', texto: (d) => `Vence en ${d} d` },
};

export function vencimientoBadge(fechaVencimiento) {
  const { estado, dias } = estadoVencimiento(fechaVencimiento);
  const cfg = VENCIMIENTO_BADGES[estado];
  return h('span', { class: `badge ${cfg.class}` }, cfg.texto(dias));
}
