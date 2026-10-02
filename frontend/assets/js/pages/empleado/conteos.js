import { conteoView } from '../shared/conteoView.js';

export function conteoLibreEmpleado({ params }) {
  return conteoView({ conteoId: params.id, backHref: '#/empleado/dashboard' });
}
export function conteoCategoriasEmpleado({ params }) {
  return conteoView({ conteoId: params.id, backHref: '#/empleado/dashboard' });
}
