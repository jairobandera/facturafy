import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';
import { ui } from '../../core/ui.js';

const ROLES = [
  { value: 'SUPERADMINISTRADOR', label: 'Super Administrador' },
  { value: 'ADMINISTRADOR', label: 'Administrador' },
  { value: 'EMPLEADO', label: 'Empleado' },
  { value: 'CAJERO', label: 'Cajero' },
];


function config(extra = {}) {
  return {
    navTitle: 'Usuarios',
    title: 'Usuarios',
    subtitle: 'Gestión de usuarios y roles.',
    entityName: 'usuario',
    load: async () => {
      const [usuarios, sucursales] = await Promise.all([api.get('/usuarios/all'), api.get('/sucursales/all')]);
      const nombreSuc = new Map(sucursales.map((s) => [s.id, s.nombre]));
      return usuarios.map((u) => ({ ...u, sucursalNombre: nombreSuc.get(u.sucursalId) || '-' }));
    },
    searchKeys: ['nombre', 'apellido', 'nombreUsuario', 'rol', 'sucursalNombre'],
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'nombre', label: 'Nombre', render: (r) => `${r.nombre || ''} ${r.apellido || ''}`.trim() },
      { key: 'nombreUsuario', label: 'Usuario' },
      { key: 'rol', label: 'Rol' },
      {
        key: 'sucursalNombre',
        label: 'Sucursal',
        render: (r) => h('span', {}, [
          r.sucursalNombre,
          r.cuentaEnCualquierSucursal
            ? h('span', { class: 'badge text-bg-info ms-1', title: 'Puede contar en cualquier sucursal de su empresa' }, 'Multi')
            : null,
        ]),
      },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: async (row) => {
      const [empresas, sucursales] = await Promise.all([api.get('/empresas'), api.get('/sucursales')]);
      const empresaOptions = empresas.map((e) => ({ value: e.id, label: e.nombre }));
      const sucsDeEmpresa = (empresaId) => sucursales
        .filter((s) => String(s.empresaId) === String(empresaId))
        .map((s) => ({ value: s.id, label: s.nombre }));

      // En edición, deducimos la empresa a partir de la sucursal actual del usuario.
      const sucActual = row?.sucursalId ? sucursales.find((s) => s.id === row.sucursalId) : null;
      const empresaActual = sucActual?.empresaId ?? '';
      const sucInicial = empresaActual !== '' ? sucsDeEmpresa(empresaActual) : [];

      return [
        { name: 'nombre', label: 'Nombre', required: true, value: row?.nombre, colClass: 'col-md-6' },
        { name: 'apellido', label: 'Apellido', value: row?.apellido, colClass: 'col-md-6' },
        { name: 'nombreUsuario', label: 'Nombre de usuario', required: true, value: row?.nombreUsuario, colClass: 'col-md-6' },
        { name: 'rol', label: 'Rol', type: 'select', required: true, value: row?.rol, options: ROLES, placeholder: 'Seleccionar rol', colClass: 'col-md-6' },
        { name: 'empresaId', label: 'Empresa', type: 'select', value: empresaActual, options: empresaOptions,
          placeholder: 'Seleccionar empresa', colClass: 'col-md-6',
          help: 'Elegí la empresa para filtrar sus sucursales.',
          onChange: (value, { setOptions }) => setOptions('sucursalId', sucsDeEmpresa(value), null, 'Seleccionar sucursal') },
        { name: 'sucursalId', label: 'Sucursal', type: 'select', value: row?.sucursalId, options: sucInicial,
          placeholder: 'Seleccionar sucursal', colClass: 'col-md-6' },
        { name: 'contrasenia', label: row ? 'Nueva contraseña (opcional)' : 'Contraseña', type: 'password', required: !row, value: '', colClass: 'col-md-6' },
        {
          name: 'cuentaEnCualquierSucursal', label: 'Puede contar en cualquier sucursal',
          type: 'checkbox', value: row ? row.cuentaEnCualquierSucursal : false, colClass: 'col-12',
          help: 'Le permite ver y participar en los conteos de las demás sucursales de su empresa, '
            + 'no sólo en los de la suya. Los administradores ya pueden hacerlo por su rol.',
        },
        ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
      ];
    },
    toDto: (v) => {
      const dto = {
        nombre: v.nombre, apellido: v.apellido, nombreUsuario: v.nombreUsuario,
        rol: v.rol, sucursalId: v.sucursalId ? Number(v.sucursalId) : null, activo: v.activo,
        cuentaEnCualquierSucursal: !!v.cuentaEnCualquierSucursal,
      };
      if (v.contrasenia) dto.contrasenia = v.contrasenia;
      return dto;
    },
    create: (dto) => api.post('/usuarios', dto),
    update: (id, dto) => api.put(`/usuarios/${id}`, dto),
    remove: (row) => api.del(`/usuarios/${row.id}`),
    extraActions: [{
      icon: 'bi-key', title: 'Restablecer contraseña', className: 'btn-outline-warning',
      onClick: async (row) => {
        const { value } = await Swal.fire({
          title: `Nueva contraseña para ${row.nombreUsuario}`,
          input: 'password', inputPlaceholder: 'Nueva contraseña',
          showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar',
        });
        if (!value) return;
        try { await api.put(`/usuarios/${row.id}/reset-password`, value, { raw: true }); ui.success('Contraseña actualizada.'); }
        catch (err) { ui.error(err.message); }
      },
    }],
    ...extra,
  };
}

export function verUsuarios() { return crudPage(config()); }
export function crearUsuario() { return crudPage(config({ openCreate: true })); }
export function editarUsuario({ params }) { return crudPage(config({ openEditId: params.id })); }
