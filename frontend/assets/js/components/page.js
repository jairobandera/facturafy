// Helpers de presentacion de paginas.
import { h } from '../core/dom.js';

export function pageHeader(title, subtitle, actions = []) {
  return h('div', { class: 'd-flex flex-wrap justify-content-between align-items-center mb-4 gap-2' }, [
    h('div', {}, [
      h('h4', { class: 'mb-0 fw-semibold' }, title),
      subtitle ? h('p', { class: 'text-muted mb-0 small' }, subtitle) : null,
    ]),
    h('div', { class: 'd-flex gap-2' }, actions),
  ]);
}

export function primaryButton(label, icon, onClick) {
  return h('button', { class: 'btn btn-primary', onClick }, [
    icon ? h('i', { class: `bi ${icon} me-1` }) : null, label,
  ]);
}

export function outlineButton(label, icon, onClick, cls = 'btn-outline-secondary') {
  return h('button', { class: `btn ${cls}`, onClick }, [
    icon ? h('i', { class: `bi ${icon} me-1` }) : null, label,
  ]);
}

export function spinner(text = 'Cargando...') {
  return h('div', { class: 'text-center text-muted py-5' }, [
    h('div', { class: 'spinner-border text-primary mb-2', role: 'status' }),
    h('div', {}, text),
  ]);
}

export function badge(text, kind = 'secondary') {
  return h('span', { class: `badge text-bg-${kind}` }, text);
}
