// Pantalla de clientes de facturacion. La comparten el cajero y el administrador
// (ambos pueden dar de alta clientes). Scoped por la sucursal activa.
import { api } from '../../core/api.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';
import { sucursalActiva } from '../../core/sucursal.js';

const TIPOS_DOC = [
  { value: 'RUT', label: 'RUT' },
  { value: 'CI', label: 'Cédula (CI)' },
  { value: 'OTRO', label: 'Otro' },
];

export function clientesPage(navTitle = 'Clientes') {
  const sucursalId = sucursalActiva();
  return crudPage({
    navTitle,
    title: 'Clientes',
    subtitle: 'Clientes de facturación de tu sucursal.',
    entityName: 'cliente',
    load: () => api.get(`/clientes/sucursal/${sucursalId}`),
    searchKeys: ['rut', 'razonSocial', 'nombreFantasia', 'telefono', 'email'],
    columns: [
      { key: 'razonSocial', label: 'Razón social', render: (r) => r.razonSocial || r.nombreFantasia || '-' },
      { key: 'rut', label: 'RUT', render: (r) => r.rut || '-' },
      { key: 'nombreFantasia', label: 'Nombre fantasía', render: (r) => r.nombreFantasia || '-' },
      { key: 'telefono', label: 'Teléfono', render: (r) => r.telefono || '-' },
      { key: 'email', label: 'Email', render: (r) => r.email || '-' },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      { name: 'razonSocial', label: 'Razón social', required: true, value: row?.razonSocial, colClass: 'col-md-6' },
      { name: 'rut', label: 'RUT', value: row?.rut, colClass: 'col-md-6',
        help: 'Opcional. Si lo cargás, debe ser único en la sucursal.' },
      { name: 'nombreFantasia', label: 'Nombre fantasía', value: row?.nombreFantasia, colClass: 'col-md-6' },
      { name: 'tipoDocumento', label: 'Tipo de documento', type: 'select', value: row?.tipoDocumento || 'RUT',
        options: TIPOS_DOC, colClass: 'col-md-6' },
      { name: 'direccion', label: 'Dirección', value: row?.direccion, colClass: 'col-md-6' },
      { name: 'telefono', label: 'Teléfono', value: row?.telefono, colClass: 'col-md-6' },
      { name: 'email', label: 'Email', type: 'email', value: row?.email, colClass: 'col-md-6' },
      ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
    ],
    toDto: (v, row) => ({
      razonSocial: v.razonSocial, rut: v.rut || null, nombreFantasia: v.nombreFantasia || null,
      tipoDocumento: v.tipoDocumento || 'RUT', direccion: v.direccion || null,
      telefono: v.telefono || null, email: v.email || null,
      // En alta se fija la sucursal activa; en edicion no se cambia de sucursal.
      ...(row ? {} : { sucursalId }),
      ...(row ? { activo: v.activo } : {}),
    }),
    create: (dto) => api.post('/clientes', dto),
    update: (id, dto) => api.put(`/clientes/${id}`, dto),
    remove: (row) => api.del(`/clientes/${row.id}`),
  });
}
