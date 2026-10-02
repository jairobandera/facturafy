// Selector de sucursal para las pantallas del administrador.
// Arranca siempre en la sucursal propia y deja elegir cualquier otra de la empresa.
import { h } from '../core/dom.js';
import { sucursalActiva, setSucursalActiva, sucursalesDeMiEmpresa, esMiSucursal } from '../core/sucursal.js';

/**
 * Devuelve el elemento al instante y se completa solo cuando llega la lista.
 * Si la empresa tiene una sola sucursal no muestra nada (no hay nada que elegir).
 * @param {(sucursalId:number)=>void} onCambio
 */
export function sucursalSelect(onCambio) {
  const wrap = h('div', { class: 'd-none align-items-center gap-2' });
  (async () => {
    const sucursales = await sucursalesDeMiEmpresa();
    if (sucursales.length <= 1) return;
    const select = h('select', {
      class: 'form-select w-auto',
      onChange: (e) => {
        const id = Number(e.target.value);
        setSucursalActiva(id);
        onCambio(id);
      },
    }, sucursales.map((s) => h('option', {
      value: s.id, selected: Number(s.id) === Number(sucursalActiva()),
    }, esMiSucursal(s.id) ? `${s.nombre} (mi sucursal)` : s.nombre)));
    wrap.append(h('i', { class: 'bi bi-shop text-muted' }), select);
    wrap.classList.remove('d-none');
    wrap.classList.add('d-flex');
  })();
  return wrap;
}

/**
 * Campo de sucursal para el formulario de alta. Solo aparece cuando hay mas de
 * una sucursal y cuando se esta creando (al editar, mover de sucursal es otra cosa).
 * @param {Array} sucursales  lista ya cargada (sucursalesDeMiEmpresa)
 * @param {object} [opts] { value, help, onChange }
 */
export function campoSucursal(sucursales, { value, help, onChange } = {}) {
  if (!sucursales || sucursales.length <= 1) return [];
  return [{
    name: 'sucursalId',
    label: 'Sucursal',
    type: 'select',
    required: true,
    value: value ?? sucursalActiva(),
    colClass: 'col-md-6',
    options: sucursales.map((s) => ({
      value: s.id, label: esMiSucursal(s.id) ? `${s.nombre} (mi sucursal)` : s.nombre,
    })),
    help: help || 'Por defecto la tuya. Podés darlo de alta en otra sucursal de tu empresa.',
    onChange,
  }];
}
