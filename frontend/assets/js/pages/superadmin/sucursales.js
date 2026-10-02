import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';

async function empresaOptions() {
  const empresas = await api.get('/empresas');
  return empresas.map((e) => ({ value: e.id, label: e.nombre }));
}

function config(extra = {}) {
  return {
    navTitle: 'Sucursales',
    title: 'Sucursales',
    subtitle: 'Gestión de sucursales por empresa.',
    entityName: 'sucursal',
    load: async () => {
      const [sucursales, empresas] = await Promise.all([api.get('/sucursales/all'), api.get('/empresas/all')]);
      const nombreEmpresa = new Map(empresas.map((e) => [e.id, e.nombre]));
      return sucursales.map((s) => ({ ...s, empresaNombre: nombreEmpresa.get(s.empresaId) || '-' }));
    },
    searchKeys: ['nombre', 'direccion', 'telefono', 'empresaNombre'],
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'empresaNombre', label: 'Empresa' },
      { key: 'direccion', label: 'Dirección' },
      { key: 'telefono', label: 'Teléfono' },
      {
        key: 'usaLotes',
        label: 'Lotes',
        render: (r) => (r.usaLotes
          ? h('span', { class: 'badge text-bg-primary' }, 'Habilitado')
          : h('span', { class: 'badge text-bg-light text-dark' }, 'No usa')),
      },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: async (row) => [
      { name: 'nombre', label: 'Nombre', required: true, value: row?.nombre, colClass: 'col-md-6' },
      { name: 'empresaId', label: 'Empresa', type: 'select', required: true, value: row?.empresaId, options: await empresaOptions(), placeholder: 'Seleccionar empresa', colClass: 'col-md-6' },
      { name: 'direccion', label: 'Dirección', value: row?.direccion, colClass: 'col-md-6' },
      { name: 'telefono', label: 'Teléfono', value: row?.telefono, colClass: 'col-md-6' },
      {
        name: 'usaLotes', label: 'Usa apartado de Lotes', type: 'checkbox',
        value: row ? row.usaLotes : false, colClass: 'col-12',
        help: 'Si está marcado, los administradores de esta sucursal ven y usan la sección '
          + 'de Lotes (vencimientos y stock por lote). Si no, les queda deshabilitada.',
      },
      ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
    ],
    toDto: (v) => ({ nombre: v.nombre, empresaId: Number(v.empresaId), direccion: v.direccion, telefono: v.telefono, usaLotes: !!v.usaLotes, activo: v.activo }),
    create: (dto) => api.post('/sucursales', dto),
    update: (id, dto) => api.put(`/sucursales/${id}`, dto),
    remove: (row) => api.del(`/sucursales/${row.id}`),
    ...extra,
  };
}

export function verSucursales() { return crudPage(config()); }
export function agregarSucursal() { return crudPage(config({ openCreate: true })); }
export function editarSucursal({ params }) { return crudPage(config({ openEditId: params.id })); }
