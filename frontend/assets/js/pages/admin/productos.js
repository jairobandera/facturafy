import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { sucursalActiva, sucursalesDeMiEmpresa } from '../../core/sucursal.js';
import { sucursalSelect, campoSucursal } from '../../components/sucursalSelect.js';
import { ui, fmt } from '../../core/ui.js';
import { crudPage } from '../../components/crudPage.js';
import { activoBadge } from '../../components/badges.js';
import {
  exportToExcel, excelButton, importFromExcelRaw, findHeaderRow, matchColumnsMulti,
  claveCodigo, parsePrecio, parseNumeroEntero,
} from '../../components/excel.js';
import { formModal } from '../../components/formModal.js';
import { descargarPlantilla } from '../../components/plantillas.js';

const ALIAS_PRODUCTO = {
  codigo: ['codigo_producto', 'codigoproducto', 'id_prod', 'id_producto', 'codigo'],
  nombre: ['nombre_producto', 'nombre', 'producto', 'descripcion'],
  categoriaCodigo: ['id_cat', 'id_categoria', 'codigo_categoria'],
  categoriaNombre: ['nombre_categoria', 'categoria', 'rubro'],
  precio: ['precio', 'precio_venta', 'pvp'],
  // "stock_final" va primero: el informe trae "Stock Inicial" y "Stock Final", y el
  // match exacto de matchColumns tiene prioridad sobre el aproximado.
  stock: ['stock_final', 'stockfinal', 'cantidad_final', 'stock', 'cantidad_stock', 'existencia'],
  detalle: ['detalle', 'observacion'],
  barras: ['codigos_barra', 'codigosbarra', 'codigo_de_barras', 'codigo_barra', 'barras', 'ean'],
};

const ALIAS_BARRAS = {
  codigo: ['codigo_producto', 'codigoproducto', 'id_prod', 'id_producto', 'codigo'],
  barras: ['codigo_de_barras', 'codigos_barra', 'codigosbarra', 'codigo_barra', 'barras', 'ean'],
};

const ALIAS_STOCK_CONTEO = {
  codigo: ['codigo', 'codigo_producto', 'id_prod', 'id_producto'],
  stock: ['stock_final', 'stockfinal', 'stock', 'existencia', 'cantidad_final'],
};

export function gestionarProductos() {
  // Sucursal que se esta viendo: la propia por defecto, cambiable desde la barra.
  // Todo (catalogo, importaciones y altas) trabaja sobre ella.
  let sucursalId = sucursalActiva();
  let sucursales = [];
  const selectorSucursal = sucursalSelect((id) => { sucursalId = id; pageRef.refresh(); });
  let categorias = [];
  let proveedores = [];
  let current = [];
  let pageRef;

  async function loadRefs() {
    [categorias, proveedores] = await Promise.all([
      sucursalId ? api.get(`/categorias/sucursal/${sucursalId}`) : api.get('/categorias'),
      sucursalId ? api.get(`/proveedores/sucursal/${sucursalId}/activos`) : api.get('/proveedores'),
    ]);
  }

  const nombreCat = (id) => categorias.find((c) => c.id === id)?.nombre || '-';

  const plantillaBtn = excelButton('Plantilla', 'bi-file-earmark-arrow-down', () => descargarPlantilla('productos'), 'btn-outline-secondary');
  const importBtn = excelButton('Importar catálogo', 'bi-upload', () => onImport(), 'btn-outline-primary');
  const barrasBtn = excelButton('Importar códigos de barra', 'bi-upc-scan', () => onImportBarras(), 'btn-outline-secondary');
  const stockBtn = excelButton('Cargar stock (conteo)', 'bi-clipboard-data', () => onCargarStock(), 'btn-outline-warning');
  // "Importar códigos de barra" y "Cargar stock" trabajan sobre productos que ya
  // existen: sin catálogo cargado no hacen nada, así que se deshabilitan.
  function actualizarBotonesDependientes(hayProductos) {
    for (const btn of [barrasBtn, stockBtn]) {
      btn.disabled = !hayProductos;
      btn.title = hayProductos ? '' : 'Primero importá el catálogo de productos.';
    }
  }
  actualizarBotonesDependientes(false); // hasta que termine la primera carga

  const exportBtn = excelButton('Exportar', 'bi-file-earmark-excel', () => {
    exportToExcel(current.map((p) => ({
      CodigoProducto: p.codigoProducto, Nombre: p.nombre, Detalle: p.detalle,
      Precio: p.precio, Stock: p.cantidadStock, Categoria: nombreCat(p.categoriaId),
      CodigosBarra: (p.codigosBarra || []).join(' | '), Activo: p.activo ? 'Sí' : 'No',
    })), 'productos');
  });

  // Resuelve el id de categoria a partir del codigo (ID_CAT) o el nombre del Excel.
  function resolveCategoriaId(codigoCat, nombreCat) {
    const cod = String(codigoCat ?? '').trim();
    if (cod) {
      const porCodigo = categorias.find((c) => String(c.codigoCategoria ?? '').trim() === cod);
      if (porCodigo) return porCodigo.id;
    }
    const nom = String(nombreCat ?? '').trim().toLowerCase();
    if (nom) {
      const porNombre = categorias.find((c) => (c.nombre ?? '').trim().toLowerCase() === nom);
      if (porNombre) return porNombre.id;
    }
    return null; // el backend usa "Sin categoria" por defecto
  }

  /**
   * Lee un archivo de códigos de barra y devuelve un Map clave(codigoProducto) -> [barras].
   * Tolera: varias filas del mismo producto, varios EAN separados por , ; | en una
   * celda, y varias columnas de EAN (EAN1, EAN2...). La clave va normalizada para
   * que "2187944" del Excel cruce con "002187944" de la base.
   */
  function leerBarrasDeMatriz(matriz) {
    const header = findHeaderRow(matriz, ALIAS_BARRAS, ['codigo', 'barras']);
    if (!header) return null;
    const { index } = header;
    const multi = matchColumnsMulti(matriz[index], ALIAS_BARRAS);
    const colCodigo = header.cols.codigo;
    const colsBarras = multi.barras || [header.cols.barras];
    const mapa = new Map();
    for (let i = index + 1; i < matriz.length; i++) {
      const row = matriz[i] || [];
      const codigo = String(row[colCodigo] ?? '').trim();
      if (!codigo) continue;
      const barras = colsBarras.flatMap((c) => String(row[c] ?? '')
        .split(/[|,;]/).map((s) => s.trim()).filter(Boolean));
      if (!barras.length) continue;
      const clave = claveCodigo(codigo);
      mapa.set(clave, [...new Set([...(mapa.get(clave) || []), ...barras])]);
    }
    return mapa;
  }

  // Archivo de barras adjunto al importar el catálogo (opcional).
  async function pedirBarras() {
    const ok = await ui.confirm(
      'Los códigos de barra suelen venir en un archivo aparte. ¿Querés adjuntarlo ahora?',
      { title: 'Códigos de barra', confirmText: 'Sí, adjuntar', cancelText: 'No, continuar sin barras', danger: false }
    );
    if (!ok) return new Map();
    const matriz = await importFromExcelRaw();
    if (!matriz || matriz.length === 0) return new Map();
    const mapa = leerBarrasDeMatriz(matriz);
    if (!mapa) {
      ui.error('No se reconocieron las columnas del archivo de códigos de barra. Se continúa sin barras.');
      return new Map();
    }
    return mapa;
  }

  /**
   * Pantalla de códigos de barra de un producto: la única vía para QUITAR uno.
   * Quitar es baja lógica — el código deja de escanear pero queda en la base.
   */
  async function gestionarBarras(row) {
    let producto = row;
    for (;;) {
      const barras = producto.codigosBarra || [];
      const values = await formModal({
        title: `Códigos de barra — ${producto.nombre}`,
        submitText: 'Agregar',
        fields: [
          {
            name: 'quitar', label: `Códigos actuales (${barras.length})`, type: 'checkboxgroup',
            options: barras.map((b) => ({ value: b, label: b })),
            help: barras.length
              ? 'Marcá los que quieras quitar. No se borran: dejan de escanear pero quedan guardados.'
              : 'Este producto todavía no tiene códigos de barra.',
            colClass: 'col-12',
          },
          {
            name: 'nuevo', label: 'Agregar un código', value: '', colClass: 'col-12',
            placeholder: 'Escaneá o pegá uno o varios separados por coma',
            help: 'Se suman a los de arriba; los anteriores siguen funcionando. Podés pegar varios separados por coma y entran como códigos distintos.',
          },
        ],
      });
      if (!values) return;

      const aQuitar = values.quitar || [];
      const nuevo = String(values.nuevo || '').trim();
      if (!aQuitar.length && !nuevo) return;

      ui.loading('Guardando...');
      try {
        for (const codigo of aQuitar) {
          producto = await api.del(`/productos/${producto.id}/codigos-barra/${encodeURIComponent(codigo)}`);
        }
        // Se manda el texto crudo: el backend separa por coma, punto y coma, barra o espacio.
        if (nuevo) producto = await api.post(`/productos/${producto.id}/codigos-barra`, { codigo: nuevo });
        ui.close();
        ui.success('Códigos actualizados.');
        pageRef.refresh();
      } catch (err) {
        ui.close();
        ui.error(err.message);
        return;
      }
    }
  }

  // Importación dedicada: sólo códigos de barra, sobre productos que ya existen.
  async function onImportBarras() {
    const matriz = await importFromExcelRaw();
    if (!matriz || matriz.length === 0) return;
    const mapa = leerBarrasDeMatriz(matriz);
    if (!mapa) {
      ui.error('No se reconocieron las columnas. El archivo necesita una columna con el código de producto y otra con los códigos de barra.');
      return;
    }
    if (mapa.size === 0) { ui.error('El archivo no tiene códigos de barra para importar.'); return; }

    // La clave está normalizada; se vuelve al código real del producto de la sucursal.
    const porClave = new Map(current.map((p) => [claveCodigo(p.codigoProducto), p.codigoProducto]));
    const filas = [...mapa.entries()].map(([clave, barras]) => ({
      codigoProducto: porClave.get(clave) || clave,
      codigosBarra: barras,
    }));

    ui.loading('Importando códigos de barra...');
    try {
      const res = await api.post(`/productos/codigos-barra?sucursalId=${sucursalId}`, filas);
      ui.close();
      const conflictos = res.conflictos || [];
      const noEncontrados = res.noEncontrados || [];
      ui.info('Códigos de barra importados', [
        `Filas leídas del archivo: <b>${filas.length}</b>`,
        `Códigos agregados: <b>${res.agregadas?.length || 0}</b>`,
        `Productos actualizados: <b>${res.productosActualizados?.length || 0}</b>`,
        `Ya estaban cargados: ${res.yaExistian?.length || 0}`,
        noEncontrados.length
          ? `<hr><div class="text-start small"><b>${noEncontrados.length} producto(s) del archivo no existen en esta sucursal:</b><br>`
            + noEncontrados.slice(0, 15).join(', ') + (noEncontrados.length > 15 ? ', ...' : '') + '</div>'
          : 'Productos del archivo que no existen en esta sucursal: 0',
        conflictos.length
          ? `<hr><div class="text-start small"><b>${conflictos.length} código(s) ya pertenecen a otro producto y se saltearon:</b><br>`
            + conflictos.slice(0, 15).map((c) => `${c.codigo} → es del producto ${c.codigoProducto}`).join('<br>')
            + (conflictos.length > 15 ? '<br>...' : '') + '</div>'
          : '',
      ].filter(Boolean).join('<br>'));
      pageRef.refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function onImport() {
    const matriz = await importFromExcelRaw();
    if (!matriz || matriz.length === 0) return;
    const header = findHeaderRow(matriz, ALIAS_PRODUCTO, ['codigo', 'nombre']);
    if (!header) {
      ui.error('No se reconocieron las columnas de código y nombre en el archivo de productos.');
      return;
    }
    const barrasPorCodigo = await pedirBarras();
    ui.loading('Importando productos...');
    await loadRefs(); // refresca categorias por si se importaron recien
    const { index, cols } = header;
    const cell = (row, field) => (cols[field] !== undefined ? row[cols[field]] : null);
    const productos = [];
    let ignoradasSinNombre = 0;
    for (let i = index + 1; i < matriz.length; i++) {
      const row = matriz[i] || [];
      const codigoProducto = String(cell(row, 'codigo') ?? '').trim();
      const nombre = String(cell(row, 'nombre') ?? '').trim();
      if (!codigoProducto && !nombre) continue;
      // Pie del informe (fecha, razon social): tiene algo en la columna del codigo
      // pero no es un producto. Se ignora en vez de mandarlo y que falle.
      if (!nombre) { ignoradasSinNombre++; continue; }
      let stock = parseNumeroEntero(cell(row, 'stock'));
      if (stock === null && cols.stock !== undefined) stock = parseNumeroEntero(row[cols.stock + 1]);
      // Codigos de barra: los de la misma planilla (columna inline) + los del archivo aparte.
      const barrasInline = String(cell(row, 'barras') ?? '')
        .split(/[|,;]/).map((s) => s.trim()).filter(Boolean);
      const codigosBarra = [...new Set([
        ...barrasInline,
        ...(barrasPorCodigo.get(claveCodigo(codigoProducto)) || []),
      ])];
      productos.push({
        codigoProducto,
        nombre,
        detalle: cell(row, 'detalle') != null ? String(cell(row, 'detalle')).trim() : null,
        precio: parsePrecio(cell(row, 'precio')),
        cantidadStock: stock ?? 0,
        categoriaId: resolveCategoriaId(cell(row, 'categoriaCodigo'), cell(row, 'categoriaNombre')),
        // Si la categoría no existe todavía, el backend la crea con estos datos.
        categoriaCodigo: cell(row, 'categoriaCodigo') != null ? String(cell(row, 'categoriaCodigo')).trim() : null,
        categoriaNombre: cell(row, 'categoriaNombre') != null ? String(cell(row, 'categoriaNombre')).trim() : null,
        codigosBarra,
      });
    }
    if (productos.length === 0) { ui.close(); ui.error('No se encontraron productos para importar.'); return; }
    try {
      const res = await api.post(`/productos/crear-simples?sucursalId=${sucursalId}`, productos);
      ui.close();
      const conflictos = res.conflictos || [];
      const creados = res.creados?.length || 0;
      const existian = res.yaExistian?.length || 0;
      const errores = res.errores?.length || 0;
      // Red de seguridad: ninguna fila puede desaparecer sin quedar contada.
      const procesadas = creados + existian + errores;
      ui.info('Importación finalizada', [
        `Filas leídas del archivo: <b>${productos.length}</b>`,
        ignoradasSinNombre ? `Filas ignoradas (sin nombre de producto): ${ignoradasSinNombre}` : '',
        `Productos creados: <b>${creados}</b>`,
        // Los que ya existían no se rechazan: se les suman las barras nuevas.
        `Ya existían (no se tocó precio ni stock): ${existian}`,
        `Códigos de barra agregados: ${res.barrasAgregadas?.length || 0}`,
        `Categorías creadas: ${res.categoriasCreadas?.length || 0}`,
        `Errores: ${errores}`,
        procesadas !== productos.length
          ? `<div class="alert alert-warning text-start small mt-2 mb-0">Se enviaron ${productos.length} filas pero el servidor procesó ${procesadas}. Avisá de esto.</div>`
          : '',
        errores ? `<hr><div class="text-start small">${res.errores.slice(0, 15).join('<br>')}</div>` : '',
        conflictos.length
          ? `<hr><div class="text-start small"><b>${conflictos.length} código(s) de barra ya eran de otro producto y se saltearon:</b><br>`
            + conflictos.slice(0, 15).map((c) => `${c.codigo} → ya es del producto ${c.codigoProducto}`).join('<br>')
            + (conflictos.length > 15 ? '<br>...' : '') + '</div>'
          : '',
      ].filter(Boolean).join('<br>'));
      pageRef.refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  // Carga el "Stock Final" de un reporte (general.xls) como stock esperado del conteo.
  async function onCargarStock() {
    const matriz = await importFromExcelRaw();
    if (!matriz || matriz.length === 0) return;
    const header = findHeaderRow(matriz, ALIAS_STOCK_CONTEO, ['codigo', 'stock']);
    if (!header) {
      ui.error('No se reconocieron las columnas de código y stock final en el archivo.');
      return;
    }
    const { index, cols } = header;
    const productos = [];
    let ignorados = 0;
    for (let i = index + 1; i < matriz.length; i++) {
      const row = matriz[i] || [];
      const codigoProducto = String(row[cols.codigo] ?? '').trim();
      if (!codigoProducto) continue;
      // El valor numerico puede estar en la columna del encabezado o en la siguiente
      // (en el reporte, la columna del encabezado "Stock Final" contiene la unidad).
      let stock = parseNumeroEntero(row[cols.stock]);
      if (stock === null) stock = parseNumeroEntero(row[cols.stock + 1]);
      if (stock === null) { ignorados++; continue; }
      productos.push({ codigoProducto, cantidadStock: stock });
    }
    if (productos.length === 0) {
      ui.error(`No se encontró stock válido para cargar. Filas ignoradas (vacías o con decimales): ${ignorados}.`);
      return;
    }
    ui.loading('Cargando stock esperado...');
    try {
      const res = await api.post(`/productos/actualizar-masivo?sucursalId=${sucursalId}`, productos);
      ui.close();
      ui.info('Carga de stock finalizada',
        `Actualizados: ${res.actualizados?.length || 0}<br>No encontrados: ${res.noEncontrados?.length || 0}<br>Ignorados (vacíos/decimales): ${ignorados}` +
        (res.noEncontrados?.length ? `<hr><div class="text-start small">Sin coincidencia: ${res.noEncontrados.slice(0, 15).join(', ')}</div>` : ''));
      pageRef.refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  pageRef = crudPage({
    navTitle: 'Productos',
    title: 'Productos',
    subtitle: 'Inventario de productos de la sucursal.',
    entityName: 'producto',
    load: async () => {
      sucursales = await sucursalesDeMiEmpresa();
      await loadRefs();
      current = sucursalId ? await api.get(`/productos/sucursal/${sucursalId}/activos`) : await api.get('/productos');
      return current;
    },
    searchKeys: ['codigoProducto', 'nombre', 'detalle'],
    columns: [
      { key: 'codigoProducto', label: 'Código' },
      { key: 'nombre', label: 'Nombre' },
      { key: 'categoriaId', label: 'Categoría', render: (r) => nombreCat(r.categoriaId) },
      { key: 'precio', label: 'Precio', render: (r) => fmt.money(r.precio) },
      { key: 'cantidadStock', label: 'Stock' },
      {
        key: 'codigosBarra',
        label: 'Códigos',
        render: (r) => {
          const barras = r.codigosBarra || [];
          if (!barras.length) return h('span', { class: 'text-muted small' }, 'sin código');
          return h('span', { class: 'small' }, [
            barras[0],
            barras.length > 1 ? h('span', { class: 'badge text-bg-secondary ms-1' }, `+${barras.length - 1}`) : null,
          ]);
        },
      },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      // Al crear se elige la sucursal; al editar se conserva la del producto.
      ...(row ? [] : campoSucursal(sucursales, { help: 'El producto se crea en esta sucursal.' })),
      { name: 'codigoProducto', label: 'Código de producto', required: true, value: row?.codigoProducto, colClass: 'col-md-4' },
      { name: 'nombre', label: 'Nombre', required: true, value: row?.nombre, colClass: 'col-md-8' },
      { name: 'precio', label: 'Precio', type: 'number', min: 0, step: '0.01', required: true, value: row?.precio, colClass: 'col-md-4' },
      { name: 'cantidadStock', label: 'Stock', type: 'number', required: true, value: row?.cantidadStock, colClass: 'col-md-4', help: 'Puede ser negativo si se vendió más de lo cargado.' },
      { name: 'categoriaId', label: 'Categoría', type: 'select', value: row?.categoriaId, options: categorias.map((c) => ({ value: c.id, label: c.nombre })), placeholder: 'Sin categoría', colClass: 'col-md-4' },
      { name: 'codigosBarra', label: 'Códigos de barra', type: 'tags', value: row?.codigosBarra, help: 'Separar múltiples códigos con comas. Sólo se agregan: para quitar uno, usá el botón de códigos de barra de la lista.', colClass: 'col-md-6' },
      { name: 'proveedorIds', label: 'Proveedores', type: 'multiselect', value: row?.proveedorIds, options: proveedores.map((p) => ({ value: p.id, label: p.nombre })), colClass: 'col-md-6' },
      { name: 'detalle', label: 'Detalle', type: 'textarea', value: row?.detalle },
      { name: 'imagen', label: 'Imagen', type: 'image', value: row?.imagen },
      ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo }] : []),
    ],
    toDto: (v, row) => ({
      codigoProducto: v.codigoProducto, nombre: v.nombre, detalle: v.detalle,
      precio: Number(v.precio), cantidadStock: Number(v.cantidadStock),
      categoriaId: v.categoriaId ? Number(v.categoriaId) : null,
      sucursalId: row ? row.sucursalId : Number(v.sucursalId ?? sucursalId),
      codigosBarra: v.codigosBarra,
      proveedorIds: (v.proveedorIds || []).map(Number),
      imagen: v.imagen || null, activo: v.activo,
    }),
    create: (dto) => api.post('/productos', dto),
    update: (id, dto) => api.put(`/productos/${id}`, dto),
    remove: (row) => api.del(`/productos/${row.id}`),
    extraActions: [{
      icon: 'bi-upc-scan', title: 'Códigos de barra', className: 'btn-outline-secondary',
      onClick: (row) => gestionarBarras(row),
    }],
    toolbar: h('div', { class: 'd-flex flex-wrap gap-2 align-items-center' },
      [selectorSucursal, plantillaBtn, importBtn, barrasBtn, stockBtn, exportBtn]),
    afterRefresh: (rows) => actualizarBotonesDependientes(rows.length > 0),
  });
  return pageRef;
}
