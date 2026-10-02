import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { sucursalActiva, sucursalesDeMiEmpresa } from '../../core/sucursal.js';
import { sucursalSelect, campoSucursal } from '../../components/sucursalSelect.js';
import { ui } from '../../core/ui.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';
import { exportToExcel, importFromExcel, excelButton } from '../../components/excel.js';

export function gestionarProveedores() {
  // El proveedor es compartido entre sucursales: lo que cambia por sucursal es el
  // vinculo (sucursal_proveedor). El selector define sobre que sucursal se trabaja.
  let sucursalId = sucursalActiva();
  let sucursales = [];
  let current = [];
  let pageRef;

  const selector = sucursalSelect((id) => { sucursalId = id; pageRef.refresh(); });

  const importBtn = excelButton('Importar', 'bi-upload', async () => {
    try {
      const filas = await importFromExcel();
      if (!filas || filas.length === 0) return;
      ui.loading('Importando proveedores...');
      let ok = 0, fail = 0;
      for (const f of filas) {
        const dto = {
          rut: String(f.RUT ?? f.Rut ?? f.rut ?? '').trim(),
          nombre: String(f.Nombre ?? f.nombre ?? '').trim(),
          direccion: f.Direccion ?? f.Dirección ?? f.direccion ?? null,
          telefono: f.Telefono ?? f.Teléfono ?? f.telefono ?? null,
          nombreVendedor: f.Vendedor ?? f.NombreVendedor ?? f.nombreVendedor ?? null,
        };
        if (!dto.rut || !dto.nombre) { fail++; continue; }
        try { await api.post(`/sucursal-proveedor/sucursal/${sucursalId}`, dto); ok++; } catch { fail++; }
      }
      ui.close();
      ui.info('Importación finalizada', `Creados: ${ok}<br>Con error/omitidos: ${fail}`);
      pageRef?.refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }, 'btn-outline-primary');

  const exportBtn = excelButton('Exportar', 'bi-file-earmark-excel', () => {
    exportToExcel(current.map((p) => ({
      RUT: p.rut, Nombre: p.nombre, Direccion: p.direccion, Telefono: p.telefono, Vendedor: p.nombreVendedor, Activo: p.activo ? 'Sí' : 'No',
    })), 'proveedores');
  });

  pageRef = crudPage({
    navTitle: 'Proveedores',
    title: 'Proveedores',
    subtitle: 'Proveedores asociados a la sucursal.',
    entityName: 'proveedor',
    load: async () => {
      sucursales = await sucursalesDeMiEmpresa();
      const rows = await api.get(`/sucursal-proveedor/sucursal/${sucursalId}`);
      current = rows.map((r) => ({
        id: r.proveedorId, rut: r.proveedorRut, nombre: r.proveedorNombre,
        direccion: r.proveedorDireccion, telefono: r.proveedorTelefono,
        nombreVendedor: r.proveedorNombreVendedor, activo: r.proveedorActivo,
      }));
      return current;
    },
    searchKeys: ['nombre', 'rut', 'telefono', 'nombreVendedor'],
    columns: [
      { key: 'rut', label: 'RUT' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'nombreVendedor', label: 'Vendedor' },
      { key: 'telefono', label: 'Teléfono' },
      { key: 'direccion', label: 'Dirección' },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      // Al crear, la sucursal define a cuál se vincula el proveedor.
      ...(row ? [] : campoSucursal(sucursales, { help: 'El proveedor queda asociado a esta sucursal.' })),
      { name: 'rut', label: 'RUT', required: true, value: row?.rut, colClass: 'col-md-6' },
      { name: 'nombre', label: 'Nombre', required: true, value: row?.nombre, colClass: 'col-md-6' },
      { name: 'nombreVendedor', label: 'Vendedor', value: row?.nombreVendedor, colClass: 'col-md-6' },
      { name: 'telefono', label: 'Teléfono', value: row?.telefono, colClass: 'col-md-6' },
      { name: 'direccion', label: 'Dirección', value: row?.direccion },
    ],
    toDto: (v) => ({
      rut: v.rut, nombre: v.nombre, direccion: v.direccion, telefono: v.telefono,
      nombreVendedor: v.nombreVendedor,
      sucursalId: Number(v.sucursalId ?? sucursalId), // solo lo usa el alta
    }),
    create: (dto) => api.post(`/sucursal-proveedor/sucursal/${dto.sucursalId}`, dto),
    update: (id, dto) => api.put(`/sucursal-proveedor/proveedor/${id}`, dto),
    remove: (row) => api.put(`/sucursal-proveedor/proveedor/${row.id}/activo/false`),
    toolbar: h('div', { class: 'd-flex flex-wrap gap-2 align-items-center' }, [selector, importBtn, exportBtn]),
  });
  return pageRef;
}
