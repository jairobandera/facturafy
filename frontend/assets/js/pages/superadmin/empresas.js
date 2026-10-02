import { api } from '../../core/api.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';

function config(extra = {}) {
  return {
    navTitle: 'Empresas',
    title: 'Empresas',
    subtitle: 'Gestión de empresas del sistema.',
    entityName: 'empresa',
    load: () => api.get('/empresas/all'),
    searchKeys: ['nombre', 'rut', 'direccion', 'telefono'],
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'rut', label: 'RUT' },
      { key: 'direccion', label: 'Dirección' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      { name: 'nombre', label: 'Nombre', required: true, value: row?.nombre, colClass: 'col-md-6' },
      { name: 'rut', label: 'RUT', value: row?.rut, colClass: 'col-md-6' },
      { name: 'direccion', label: 'Dirección', value: row?.direccion, colClass: 'col-md-6' },
      { name: 'telefono', label: 'Teléfono', value: row?.telefono, colClass: 'col-md-6' },
      ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
    ],
    toDto: (v) => ({ nombre: v.nombre, rut: v.rut, direccion: v.direccion, telefono: v.telefono, activo: v.activo }),
    create: (dto) => api.post('/empresas', dto),
    update: (id, dto) => api.put(`/empresas/${id}`, dto),
    remove: (row) => api.del(`/empresas/${row.id}`),
    ...extra,
  };
}

export function verEmpresas() { return crudPage(config()); }
export function crearEmpresa() { return crudPage(config({ openCreate: true })); }
export function editarEmpresa({ params }) { return crudPage(config({ openEditId: params.id })); }
