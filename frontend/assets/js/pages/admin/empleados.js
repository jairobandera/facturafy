import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { ui } from '../../core/ui.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';

export function gestionarEmpleados() {
  const sucursalId = auth.getSucursalId();

  return crudPage({
    navTitle: 'Empleados',
    title: 'Empleados',
    subtitle: 'Empleados de tu sucursal.',
    entityName: 'empleado',
    load: async () => {
      const empleados = await api.get('/usuarios/empleados');
      return empleados.filter((u) => sucursalId == null || u.sucursalId === sucursalId);
    },
    searchKeys: ['nombre', 'apellido', 'nombreUsuario'],
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'nombre', label: 'Nombre', render: (r) => `${r.nombre || ''} ${r.apellido || ''}`.trim() },
      { key: 'nombreUsuario', label: 'Usuario' },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      { name: 'nombre', label: 'Nombre', required: true, value: row?.nombre, colClass: 'col-md-6' },
      { name: 'apellido', label: 'Apellido', value: row?.apellido, colClass: 'col-md-6' },
      { name: 'nombreUsuario', label: 'Nombre de usuario', required: true, value: row?.nombreUsuario, colClass: 'col-md-6' },
      { name: 'contrasenia', label: row ? 'Nueva contraseña (opcional)' : 'Contraseña', type: 'password', required: !row, colClass: 'col-md-6' },
      ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
    ],
    toDto: (v) => {
      const dto = {
        nombre: v.nombre, apellido: v.apellido, nombreUsuario: v.nombreUsuario,
        rol: 'EMPLEADO', sucursalId, activo: v.activo,
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
          input: 'password', showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar',
        });
        if (!value) return;
        try { await api.put(`/usuarios/${row.id}/reset-password`, value, { raw: true }); ui.success('Contraseña actualizada.'); }
        catch (err) { ui.error(err.message); }
      },
    }],
  });
}
