import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { sucursalSelect } from '../../components/sucursalSelect.js';
import { crudPage } from '../../components/crudPage.js';
import { dataTable } from '../../components/dataTable.js';
import { activoBadge, vencimientoBadge, estadoVencimiento, DIAS_PROXIMO } from '../../components/badges.js';
import { excelButton, exportToExcel } from '../../components/excel.js';
import { spinner } from '../../components/page.js';
import { fmt, ui } from '../../core/ui.js';

// El stock del producto es la verdad (alta manual o Excel). Un lote solo etiqueta
// una parte de ese stock; solo suma si el usuario marca "sumar al stock".

const FILTROS = [
  { value: 'todos', label: 'Todos los activos' },
  { value: 'vencidos', label: 'Vencidos' },
  { value: 'porVencer', label: `Por vencer (${DIAS_PROXIMO} dias)` },
  { value: 'sinVencimiento', label: 'Sin vencimiento' },
  { value: 'inactivos', label: 'Incluir inactivos' },
];

function cumpleFiltro(lote, filtro) {
  const { estado } = estadoVencimiento(lote.fechaVencimiento);
  if (filtro === 'vencidos') return estado === 'vencido';
  if (filtro === 'porVencer') return estado === 'vencido' || estado === 'critico' || estado === 'proximo';
  if (filtro === 'sinVencimiento') return estado === 'sinFecha';
  return true;
}

export function gestionarLotes(ctx) {
  // Sucursal que se esta viendo. Define el catalogo de productos del formulario,
  // porque un lote pertenece al producto y el producto a una sucursal.
  let sucursalId = sucursalActiva();
  const selectorSucursal = sucursalSelect((id) => { sucursalId = id; pageRef?.refresh(); });
  let productos = [];
  let current = [];
  let pageRef;
  // Si la sucursal elegida no tiene habilitado el apartado de Lotes, no rompemos la
  // pagina: mostramos un aviso y dejamos el selector para poder cambiar de sucursal.
  let lotesDeshabilitado = false;
  const bannerLotes = h('div', { class: 'alert alert-warning py-2 px-3 mb-0 mt-2 w-100 d-none' });

  // El filtro inicial puede venir del dashboard (#/admin/gestionar-lotes?filtro=porVencer).
  const filtroInicial = ctx?.query?.filtro;
  const state = { filtro: FILTROS.some((f) => f.value === filtroInicial) ? filtroInicial : 'todos' };

  const filtroSelect = h('select', {
    class: 'form-select w-auto',
    onChange: (e) => { state.filtro = e.target.value; pageRef?.refresh(); },
  }, FILTROS.map((f) => h('option', { value: f.value, selected: f.value === state.filtro }, f.label)));

  const exportBtn = excelButton('Exportar', 'bi-file-earmark-excel', () => {
    exportToExcel(current.map((l) => ({
      NumeroLote: l.numeroLote,
      CodigoProducto: l.codigoProducto,
      Producto: l.productoNombre,
      Cantidad: l.cantidadStock,
      Ingreso: l.fechaIngreso,
      Vencimiento: l.fechaVencimiento || '',
      SumoAlStock: l.afectaStock ? 'Si' : 'No',
      Activo: l.activo ? 'Si' : 'No',
    })), 'lotes');
  });

  // ---------------- Resumen por producto (descuadres) ----------------
  const resumenWrap = h('div');
  const resumenSection = h('div', { class: 'mt-4' }, [
    h('h5', { class: 'fw-semibold mb-1' }, 'Stock por producto'),
    h('p', { class: 'text-muted small mb-3' },
      'Stock del producto = stock en lotes + stock sin lote. Si "Sin lote" es negativo hay un descuadre: '
      + 'los lotes reclaman mas unidades de las que tiene el producto.'),
    resumenWrap,
  ]);

  async function refreshResumen() {
    clear(resumenWrap);
    const loading = spinner();
    resumenWrap.append(loading);
    try {
      const filas = await api.get(`/lotes/sucursal/${sucursalId}/resumen`);
      clear(resumenWrap);
      resumenWrap.append(dataTable({
        columns: [
          { key: 'codigoProducto', label: 'Codigo' },
          { key: 'nombre', label: 'Producto' },
          { key: 'stockProducto', label: 'Stock del producto' },
          { key: 'stockEnLotes', label: 'En lotes' },
          {
            key: 'stockSinLote',
            label: 'Sin lote',
            render: (r) => (r.stockSinLote < 0
              ? h('span', { class: 'fw-semibold text-danger' }, `${r.stockSinLote} (descuadre)`)
              : String(r.stockSinLote)),
          },
          { key: 'cantidadLotes', label: 'Lotes' },
          {
            key: 'proximoVencimiento',
            label: 'Proximo vencimiento',
            render: (r) => (r.proximoVencimiento
              ? h('span', {}, [`${fmt.date(r.proximoVencimiento)} `, vencimientoBadge(r.proximoVencimiento)])
              : '-'),
          },
        ],
        rows: filas,
        rowClass: (r) => (r.stockSinLote < 0 ? 'table-danger' : ''),
        searchKeys: ['codigoProducto', 'nombre'],
        searchPlaceholder: 'Buscar producto...',
        emptyText: 'Ningun producto de esta sucursal tiene lotes cargados.',
        actions: [{
          icon: 'bi-arrow-repeat',
          title: 'Igualar el stock del producto a la suma de sus lotes',
          className: 'btn-outline-warning',
          onClick: (r) => ajustarStock(r),
        }],
      }));
    } catch (err) {
      clear(resumenWrap);
      resumenWrap.append(h('div', { class: 'alert alert-danger' }, `Error al cargar el resumen: ${err.message}`));
    }
  }

  async function ajustarStock(fila) {
    const ok = await ui.confirm(
      `El stock de "${fila.nombre}" pasaria de ${fila.stockProducto} a ${fila.stockEnLotes} `
      + '(la suma de sus lotes activos).',
      { title: 'Ajustar stock del producto', confirmText: 'Si, ajustar', danger: false }
    );
    if (!ok) return;
    ui.loading('Ajustando...');
    try {
      await api.post('/lotes/ajustar-stock', { productoId: fila.productoId });
      ui.close();
      ui.success('Stock ajustado.');
      await pageRef.refresh();
    } catch (err) {
      ui.close();
      ui.error(err.message || 'No se pudo ajustar el stock.');
    }
  }

  // ---------------- Pagina ----------------
  pageRef = crudPage({
    navTitle: 'Lotes',
    title: 'Lotes',
    subtitle: 'Vencimientos y trazabilidad del stock por producto de la sucursal.',
    entityName: 'lote',
    load: async () => {
      productos = sucursalId
        ? await api.get(`/productos/sucursal/${sucursalId}/activos`)
        : await api.get('/productos');
      const url = sucursalId
        ? `/lotes/sucursal/${sucursalId}${state.filtro === 'inactivos' ? '' : '/activos'}`
        : '/lotes';
      let lotes;
      try {
        lotes = await api.get(url);
        lotesDeshabilitado = false;
      } catch (err) {
        // 403 = la sucursal no tiene habilitado el apartado de Lotes: no es un error fatal.
        if (err.status === 403) { lotesDeshabilitado = true; current = []; return []; }
        throw err;
      }
      // Se enriquece cada lote con datos del producto para mostrarlos y poder buscarlos.
      current = lotes
        .map((l) => {
          const p = productos.find((pr) => pr.id === l.productoId);
          return { ...l, productoNombre: p?.nombre || `#${l.productoId}`, codigoProducto: p?.codigoProducto || '' };
        })
        .filter((l) => cumpleFiltro(l, state.filtro));
      return current;
    },
    searchKeys: ['numeroLote', 'productoNombre', 'codigoProducto'],
    rowClass: (r) => {
      if (!r.activo) return '';
      const { estado } = estadoVencimiento(r.fechaVencimiento);
      if (estado === 'vencido') return 'table-danger';
      if (estado === 'critico') return 'table-warning';
      return '';
    },
    columns: [
      { key: 'numeroLote', label: 'N° Lote' },
      { key: 'productoNombre', label: 'Producto' },
      { key: 'cantidadStock', label: 'Cantidad' },
      { key: 'fechaIngreso', label: 'Ingreso', render: (r) => fmt.date(r.fechaIngreso) },
      {
        key: 'fechaVencimiento',
        label: 'Vencimiento',
        render: (r) => h('span', {}, [
          r.fechaVencimiento ? `${fmt.date(r.fechaVencimiento)} ` : '',
          vencimientoBadge(r.fechaVencimiento),
        ]),
      },
      {
        key: 'afectaStock',
        label: 'Sumo al stock',
        render: (r) => (r.afectaStock
          ? h('span', { class: 'badge text-bg-primary' }, 'Si')
          : h('span', { class: 'badge text-bg-light text-dark' }, 'No')),
      },
      { key: 'activo', label: 'Estado', render: (r) => activoBadge(r.activo) },
    ],
    buildFields: (row) => [
      { name: 'numeroLote', label: 'Número de lote', required: true, value: row?.numeroLote, colClass: 'col-md-6', help: 'El número que trae el proveedor. Puede repetirse entre productos distintos.' },
      { name: 'productoId', label: 'Producto', type: 'searchselect', required: true, value: row?.productoId, options: productos.map((p) => ({ value: p.id, label: `${p.nombre} (${p.codigoProducto})` })), placeholder: 'Escribí el nombre o el código...', colClass: 'col-md-6', help: 'Buscá por nombre o código y elegilo de la lista.' },
      { name: 'cantidadStock', label: 'Cantidad de stock', type: 'number', min: 0, required: true, value: row?.cantidadStock, colClass: 'col-md-4' },
      { name: 'fechaIngreso', label: 'Fecha de ingreso', type: 'date', required: true, value: row?.fechaIngreso || hoy(), colClass: 'col-md-4' },
      { name: 'fechaVencimiento', label: 'Fecha de vencimiento', type: 'date', value: row?.fechaVencimiento, colClass: 'col-md-4' },
      {
        name: 'sumarAlStock', label: 'Sumar esta cantidad al stock del producto', type: 'checkbox',
        value: row ? row.afectaStock : false, colClass: 'col-12',
        help: 'Marcalo solo si es mercadería nueva que todavía no está incluida en el stock del producto. '
          + 'Si el stock vino del Excel, dejalo sin marcar: el lote solo etiqueta stock que ya está contado.',
      },
      ...(row ? [{ name: 'activo', label: 'Activo', type: 'checkbox', value: row.activo, colClass: 'col-12' }] : []),
    ],
    toDto: (v, row) => ({
      numeroLote: v.numeroLote,
      productoId: Number(v.productoId),
      cantidadStock: Number(v.cantidadStock),
      fechaIngreso: v.fechaIngreso,
      fechaVencimiento: v.fechaVencimiento || null,
      afectaStock: !!v.sumarAlStock,
      ...(row ? { activo: !!v.activo } : {}),
    }),
    create: (dto) => api.post('/lotes', dto),
    update: (id, dto) => api.put(`/lotes/${id}`, dto),
    remove: (row) => api.del(`/lotes/${row.id}`),
    toolbar: h('div', { class: 'w-100' }, [
      h('div', { class: 'd-flex flex-wrap gap-2 align-items-center' }, [selectorSucursal, filtroSelect, exportBtn]),
      bannerLotes,
    ]),
    footer: resumenSection,
    // El resumen depende del stock de los productos, que cambia con cada alta/baja de lote.
    afterRefresh: () => {
      // Aviso y comportamiento cuando la sucursal no tiene Lotes habilitado.
      bannerLotes.classList.toggle('d-none', !lotesDeshabilitado);
      if (lotesDeshabilitado) {
        bannerLotes.innerHTML = '';
        bannerLotes.append(h('i', { class: 'bi bi-lock-fill me-1' }),
          'Esta sucursal no tiene habilitado el apartado de Lotes. Elegí otra sucursal arriba.');
        resumenSection.classList.add('d-none');
        return;
      }
      resumenSection.classList.remove('d-none');
      if (sucursalId) refreshResumen();
    },
  });

  return pageRef;
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
