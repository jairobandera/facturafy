import { conteoView } from '../shared/conteoView.js';

export function unirseConteoLibre({ params }) {
  return conteoView({ conteoId: params.id, backHref: '#/admin/gestionar-conteos' });
}
export function unirseConteoCategorias({ params }) {
  return conteoView({ conteoId: params.id, backHref: '#/admin/gestionar-conteos' });
}
