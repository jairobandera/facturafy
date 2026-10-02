// Tarjetas de estadistica y de acceso rapido.
import { h } from '../core/dom.js';
import { router } from '../core/router.js';

export function statCard(label, value, icon, color) {
  return h('div', { class: 'sk-card sk-stat h-100' }, [
    h('div', { class: 'sk-stat-icon', style: { background: color } }, [h('i', { class: `bi ${icon}` })]),
    h('div', {}, [h('h3', {}, String(value)), h('span', {}, label)]),
  ]);
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.disabled]  Apartado no habilitado: gris y sin click.
 * @param {string}  [opts.title]     Tooltip (para explicar por que esta deshabilitado).
 */
export function quickCard(label, icon, href, opts = {}) {
  if (opts.disabled) {
    return h('div', { class: 'sk-card sk-dash-card sk-disabled p-4 text-center h-100', title: opts.title || '' }, [
      h('i', { class: `bi ${icon}`, style: { fontSize: '2rem', color: '#94a3b8' } }),
      h('div', { class: 'mt-2 fw-semibold text-muted' }, [label, ' ', h('i', { class: 'bi bi-lock-fill small' })]),
    ]);
  }
  return h('div', {
    class: 'sk-card sk-dash-card p-4 text-center h-100',
    onClick: () => router.navigate(href),
  }, [
    h('i', { class: `bi ${icon}`, style: { fontSize: '2rem', color: '#2563eb' } }),
    h('div', { class: 'mt-2 fw-semibold' }, label),
  ]);
}
