import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { sucursalActiva, sucursalActual, sucursalesDeMiEmpresa } from '../../core/sucursal.js';
import { sucursalSelect, campoSucursal } from '../../components/sucursalSelect.js';
import { ui } from '../../core/ui.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';
import {
  exportToExcel, excelButton, importFromExcelRaw, findHeaderRow,
} from '../../components/excel.js';
import { mapeoColumnas, aplicarMapeo } from '../../components/mapeoColumnas.js';
import { descargarPlantilla } from '../../components/plantillas.js';

const CAMPOS_CATEGORIA = [
  { campo: 'nombre', label: 'Nombre', requerido: true },
  { campo: 'codigo', label: 'Código', requerido: false },
  { campo: 'descripcion', label: 'Descripción', requerido: false },
];

const ALIAS_CATEGORIA = {
  codigo: ['codigo', 'codigo_categoria', 'id', 'id_cat', 'id_categoria'],
  nombre: ['nombre', 'nombre_categoria', 'categoria', 'rubro'],
  descripcion: ['descripcion', 'detalle'],
};

export function gestionarCategorias() {
  // Sucursal que se esta viendo: la propia por defecto, cambiable desde la barra.
  let sucursalId = sucursalActiva();
  let sucursales = [];
  let current = [];
  let pageRef;

  const selector = sucursalSelect((id) => { sucursalId = id; pageRef.refresh(); });

  async function onImport() {
    const matriz = await importFromExcelRaw();
    if (!matriz || matriz.length === 0) return;

    // 1) Con encabezado reconocible: como siempre.
    let filas = null;
    const header = findHeaderRow(matriz, ALIAS_CATEGORIA, ['nombre']);
    if (header) {
      const { index, cols } = header;
      const cell = (row, field) => (cols[field] !== undefined ? row[cols[field]] : null);
      filas = [];
      for (let i = index + 1; i < matriz.length; i++) {
        const row = matriz[i] || [];
        filas.push({ nombre: cell(row, 'nombre'), codigo: cell(row, 'codigo'), descripcion: cell(row, 'descripcion') });
      }
    } else {
      // 2) Sin encabezado: asistente de mapeo (con perfiles).
      const map = await mapeoColumnas({ matriz, campos: CAMPOS_CATEGORIA, empresaId: sucursalActual()?.empresaId, tipo: 'categorias' });
      if (!map) return;
      filas = aplicarMapeo(matriz, map);
    }

    const categorias = [];
    for (const f of filas) {
      const nombre = String(f.nombre ?? '').trim();
      if (!nombre) continue;
      categorias.push({
        nombre,
        codigoCategoria: String(f.codigo ?? '').trim() || null,
        descripcion: f.descripcion != null ? String(f.descripcion).trim() : null,
      });
    }
    if (categorias.length === 0) { ui.error('No se encontraron categorías para importar.'); return; }
    ui.loading('Importando categorías...');
    try {
      const res = await api.post(`/categorias/crear-lote?sucursalId=${sucursalId}`, categorias);
      ui.close();
      ui.info('Importación finalizada',
        `Creadas: ${res.creadas?.length || 0}<br>Duplicadas (omitidas): ${res.duplicadas?.length || 0}<br>Errores: ${res.errores?.length || 0}` +
        (res.errores?.length ? `<hr><div class="text-start small">${res.errores.slice(0, 15).join('<br>')}</div>` : ''));
      pageRef.refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  pageRef = crudPage({
    navTitle: 'Categorías',
    title: 'Categorías',
    subtitle: 'Categorías de productos de la sucursal.',
    entityName: 'categoría',
    load: async () => {
      sucursales = await sucursalesDeMiEmpresa();
      current = sucursalId ? await api.get(`/categorias/sucursal/${sucursalId}`) : await api.get('/categorias');
      return current;
    },
    searchKeys: ['nombre', 'descripcion', 'codigoCategoria'],
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'codigoCategoria', label: 'Código' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'descripcion', label: 'Descripción' },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      // Al crear se puede elegir la sucursal; al editar se conserva la del registro.
      ...(row ? [] : campoSucursal(sucursales, { help: 'La categoría se crea en esta sucursal.' })),
      { name: 'nombre', label: 'Nombre', required: true, value: row?.nombre, colClass: 'col-md-6' },
      { name: 'codigoCategoria', label: 'Código de categoría', value: row?.codigoCategoria, colClass: 'col-md-6' },
      { name: 'descripcion', label: 'Descripción', type: 'textarea', value: row?.descripcion },
      ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
    ],
    toDto: (v, row) => ({
      nombre: v.nombre, codigoCategoria: v.codigoCategoria, descripcion: v.descripcion,
      sucursalId: row ? row.sucursalId : Number(v.sucursalId ?? sucursalId),
      activo: v.activo,
    }),
    create: (dto) => api.post('/categorias', dto),
    update: (id, dto) => api.put(`/categorias/${id}`, dto),
    remove: (row) => api.del(`/categorias/${row.id}`),
    toolbar: h('div', { class: 'd-flex flex-wrap gap-2 align-items-center' }, [
      selector,
      excelButton('Plantilla', 'bi-file-earmark-arrow-down', () => descargarPlantilla('categorias'), 'btn-outline-secondary'),
      excelButton('Importar', 'bi-upload', () => onImport(), 'btn-outline-primary'),
      excelButton('Exportar', 'bi-file-earmark-excel', () => {
        exportToExcel(current.map((c) => ({
          Codigo: c.codigoCategoria, Nombre: c.nombre, Descripcion: c.descripcion, Activo: c.activo ? 'Sí' : 'No',
        })), 'categorias');
      }),
    ]),
  });
  return pageRef;
}
