import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';

// Para generar la contraseña de aplicación de 16 caracteres (Gmail con verificación
// en 2 pasos). Se muestra como ayuda en el formulario.
const APP_PASSWORDS_URL = 'https://myaccount.google.com/apppasswords';

async function empresaOptions() {
  const empresas = await api.get('/empresas');
  return empresas.map((e) => ({ value: e.id, label: e.nombre }));
}

// Guarda las credenciales de correo de la sucursal (se maneja aparte del CRUD para
// que la contraseña nunca viaje en el GET/PUT normal de la sucursal).
async function guardarSmtp(id, dto) {
  if (!dto.smtpUser && !dto.smtpPass) return;
  const body = { user: dto.smtpUser || '' };
  if (dto.smtpPass) body.pass = dto.smtpPass;
  await api.put(`/sucursales/${id}/smtp`, body);
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
    buildFields: async (row) => {
      // En edición, trae el correo configurado (sin la contraseña, que nunca se devuelve).
      let smtp = null;
      if (row) { try { smtp = await api.get(`/sucursales/${row.id}/smtp`); } catch { /* ignore */ } }
      return [
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
        // ---- Correo de envío (estados de cuenta de la quincena) ----
        {
          name: 'smtpUser', label: 'Correo de envío (Gmail)', type: 'email',
          value: smtp?.user || '', colClass: 'col-md-6',
          placeholder: 'ventas@gmail.com',
          help: 'Casilla desde la que se envían los estados de cuenta de esta sucursal.',
        },
        {
          name: 'smtpPass', label: 'Contraseña de aplicación (16)', type: 'password',
          value: smtp?.pass || '', colClass: 'col-md-6', autocomplete: 'new-password',
          placeholder: 'Ej: oourkfyiudezofhd',
          help: `App password de Gmail, SIN espacios (usá el ícono del ojo para verla). Se genera en: ${APP_PASSWORDS_URL}`,
        },
        ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
      ];
    },
    toDto: (v) => ({
      nombre: v.nombre, empresaId: Number(v.empresaId), direccion: v.direccion, telefono: v.telefono,
      usaLotes: !!v.usaLotes, activo: v.activo,
      // Se transportan para guardarlas aparte; el CRUD de sucursal las ignora.
      smtpUser: v.smtpUser, smtpPass: v.smtpPass,
    }),
    create: async (dto) => {
      const created = await api.post('/sucursales', dto);
      await guardarSmtp(created.id, dto);
      return created;
    },
    update: async (id, dto) => {
      const updated = await api.put(`/sucursales/${id}`, dto);
      await guardarSmtp(id, dto);
      return updated;
    },
    remove: (row) => api.del(`/sucursales/${row.id}`),
    ...extra,
  };
}

export function verSucursales() { return crudPage(config()); }
export function agregarSucursal() { return crudPage(config({ openCreate: true })); }
export function editarSucursal({ params }) { return crudPage(config({ openEditId: params.id })); }
