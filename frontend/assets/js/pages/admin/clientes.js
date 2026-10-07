// Clientes (administrador): alta/edición/baja + acceso a la cuenta corriente de cada
// cliente y envío del estado de cuenta de la quincena (a uno, varios o todos).
// El email es obligatorio (se usa para mandar el estado de cuenta).
import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { router } from '../../core/router.js';
import { crudPage } from '../../components/crudPage.js';
import { formModal } from '../../components/formModal.js';
import { activoBadge } from '../../components/badges.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { validarDocumento } from '../../core/validacion.js';

const Swal = window.Swal;

const TIPOS_DOC = [{ value: 'RUT', label: 'RUT' }, { value: 'CI', label: 'Cédula' }];

export function adminClientesPage() {
  const sucursalId = sucursalActiva();
  const btnQuincena = h('button', { class: 'btn btn-outline-primary btn-sm' },
    [h('i', { class: 'bi bi-envelope-paper me-1' }), 'Enviar quincena']);
  btnQuincena.addEventListener('click', () => enviarQuincenaModal(sucursalId));

  return crudPage({
    navTitle: 'Clientes',
    title: 'Clientes',
    subtitle: 'Clientes y cuentas corrientes de tu sucursal.',
    entityName: 'cliente',
    toolbar: btnQuincena,
    load: () => api.get(`/clientes/sucursal/${sucursalId}`),
    searchKeys: ['rut', 'razonSocial', 'nombreFantasia', 'telefono', 'email'],
    columns: [
      { key: 'razonSocial', label: 'Razón social', render: (r) => r.razonSocial || r.nombreFantasia || '-' },
      { key: 'rut', label: 'Documento', render: (r) => r.rut ? `${r.tipoDocumento || 'RUT'}: ${r.rut}` : '-' },
      { key: 'email', label: 'Email', render: (r) => r.email || '-' },
      { key: 'limiteCredito', label: 'Límite crédito', className: 'text-end', render: (r) => Number(r.limiteCredito) > 0 ? fmt.money(r.limiteCredito) : h('span', { class: 'text-muted' }, 'Sin límite') },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      { name: 'razonSocial', label: 'Razón social', required: true, value: row?.razonSocial, colClass: 'col-md-6' },
      { name: 'nombreFantasia', label: 'Nombre fantasía', value: row?.nombreFantasia, colClass: 'col-md-6' },
      { name: 'tipoDocumento', label: 'Tipo de documento', type: 'radiogroup', value: row?.tipoDocumento || 'RUT',
        options: TIPOS_DOC, colClass: 'col-md-6',
        onChange: (val) => { const el = document.getElementById('fld_rut'); if (el) el.placeholder = val === 'CI' ? 'Ej: 1.234.567-2' : 'Ej: 216000000013'; } },
      { name: 'rut', label: 'Documento', value: row?.rut, colClass: 'col-md-6',
        placeholder: (row?.tipoDocumento === 'CI') ? 'Ej: 1.234.567-2' : 'Ej: 216000000013',
        help: 'Opcional. Si lo cargás, debe ser único en la sucursal.' },
      { name: 'email', label: 'Email', type: 'email', required: true, value: row?.email, colClass: 'col-md-6',
        help: 'Obligatorio: se usa para enviarle el estado de cuenta de la quincena.' },
      { name: 'telefono', label: 'Teléfono', value: row?.telefono, colClass: 'col-md-6' },
      { name: 'limiteCredito', label: 'Límite de crédito', type: 'number', min: 0, step: '0.01',
        value: row ? Number(row.limiteCredito || 0) : undefined, colClass: 'col-md-6',
        help: row ? '0 = sin límite.' : 'Si lo dejás vacío, toma el límite por defecto de la sucursal.' },
      { name: 'direccion', label: 'Dirección', value: row?.direccion, colClass: 'col-12' },
      ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
    ],
    validate: (v) => validarDocumento(v.tipoDocumento || 'RUT', v.rut),
    toDto: (v, row) => ({
      razonSocial: v.razonSocial, rut: v.rut || null, nombreFantasia: v.nombreFantasia || null,
      tipoDocumento: v.tipoDocumento || 'RUT', direccion: v.direccion || null,
      telefono: v.telefono || null, email: v.email || null,
      ...(v.limiteCredito != null && v.limiteCredito !== '' ? { limiteCredito: Number(v.limiteCredito) } : {}),
      ...(row ? {} : { sucursalId }),
      ...(row ? { activo: v.activo } : {}),
    }),
    create: (dto) => api.post('/clientes', dto),
    update: (id, dto) => api.put(`/clientes/${id}`, dto),
    remove: (row) => api.del(`/clientes/${row.id}`),
    extraActions: [
      { icon: 'bi-wallet2', title: 'Cuenta corriente', className: 'btn-outline-success',
        onClick: (row) => router.navigate(`/admin/cliente-cuenta/${row.id}`) },
    ],
  });
}

/** Rango de la quincena actual (1-15 o 16-fin de mes) en formato YYYY-MM-DD. */
function quincenaActual() {
  const hoy = new Date();
  const y = hoy.getFullYear(); const m = hoy.getMonth();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (hoy.getDate() <= 15) return { desde: iso(new Date(y, m, 1)), hasta: iso(new Date(y, m, 15)) };
  return { desde: iso(new Date(y, m, 16)), hasta: iso(new Date(y, m + 1, 0)) };
}

/** Modal para enviar el estado de cuenta: a todos o a clientes seleccionados. */
async function enviarQuincenaModal(sucursalId) {
  let correo, clientes;
  ui.loading('Cargando...');
  try {
    [correo, clientes] = await Promise.all([
      api.get(`/sucursales/${sucursalId}/smtp`).catch(() => ({ configurado: false })),
      api.get(`/clientes/sucursal/${sucursalId}`),
    ]);
  } catch (err) { ui.close(); ui.error(err.message); return; }
  ui.close();

  if (!correo.configurado) {
    ui.error('El envío de correo no está configurado en el servidor (datos SMTP en el .env).');
    return;
  }
  const { desde, hasta } = quincenaActual();
  const values = await formModal({
    title: 'Enviar estado de cuenta (quincena)',
    submitText: 'Enviar',
    fields: [
      { name: 'desde', label: 'Desde', type: 'date', value: desde, required: true, colClass: 'col-md-6' },
      { name: 'hasta', label: 'Hasta', type: 'date', value: hasta, required: true, colClass: 'col-md-6' },
      { name: 'destino', label: '¿A quién?', type: 'radiogroup', value: 'TODOS', colClass: 'col-12',
        options: [{ value: 'TODOS', label: 'Todos los clientes' }, { value: 'SELECCION', label: 'Clientes seleccionados' }] },
      { name: 'clientes', label: 'Clientes (si elegiste "seleccionados")', type: 'multiselect', colClass: 'col-12',
        options: clientes.map((c) => ({ value: c.id, label: `${c.razonSocial || c.nombreFantasia || 'Cliente'}${c.email ? '' : ' (sin email)'}` })) },
    ],
  });
  if (!values) return;
  const clienteIds = values.destino === 'SELECCION' ? (values.clientes || []).map(Number) : [];
  if (values.destino === 'SELECCION' && !clienteIds.length) { ui.error('Elegí al menos un cliente.'); return; }

  ui.loading('Enviando estados de cuenta...');
  try {
    const r = await api.post('/clientes/quincena/enviar', { sucursalId, desde: values.desde, hasta: values.hasta, clienteIds });
    ui.close();
    const linea = (t, arr) => `<div><b>${t}:</b> ${arr.length}</div>`;
    Swal.fire({
      icon: r.enviados.length ? 'success' : 'info',
      title: 'Envío de quincena',
      html: `<div class="text-start small">
        ${linea('Enviados', r.enviados)}
        ${linea('Sin email (no enviados)', r.sinEmail)}
        ${linea('Sin movimientos (omitidos)', r.omitidos)}
        ${linea('Fallidos', r.fallidos)}
      </div>`,
      confirmButtonColor: '#2563eb',
    });
  } catch (err) { ui.close(); ui.error(err.message); }
}
