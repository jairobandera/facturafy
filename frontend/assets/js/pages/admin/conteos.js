import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { sucursalActiva, setSucursalActiva, sucursalesDeMiEmpresa, esMiSucursal } from '../../core/sucursal.js';
import { ws } from '../../core/ws.js';
import { ui, fmt } from '../../core/ui.js';
import { router } from '../../core/router.js';
import { renderShell } from '../../core/layout.js';
import { onCleanup } from '../../core/lifecycle.js';
import { pageHeader, primaryButton, outlineButton, spinner, badge } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { formModal } from '../../components/formModal.js';
import { resolveUsuarioId } from '../shared/session.js';
import { reabrirConteo } from '../shared/conteoActions.js';

export function gestionarConteos() {
  const content = renderShell('Conteos');
  // Sucursal que se esta mirando: la propia por defecto, pero el admin puede
  // trabajar sobre cualquier sucursal de su empresa.
  let sucursalId = sucursalActiva();
  let sucursales = [];

  content.append(pageHeader('Conteos', 'Creá y gestioná los conteos de inventario.', [
    primaryButton('Conteo libre', 'bi-plus-lg', () => crearLibre()),
    outlineButton('Conteo por categorías', 'bi-tags', () => crearCategorias(), 'btn-outline-primary'),
    h('span', { class: 'sk-conteo-live d-flex align-items-center gap-2 text-muted ms-2' },
      [h('span', { class: 'sk-dot on', id: 'ws-dot' }), 'En vivo']),
  ]));

  const selectorWrap = h('div', { class: 'mb-3' });
  const activosWrap = h('div', { class: 'mb-4' });
  const finalizadosWrap = h('div');
  content.append(
    selectorWrap,
    h('h5', { class: 'fw-semibold mb-2' }, 'Conteos activos'), activosWrap,
    h('div', { class: 'd-flex flex-wrap justify-content-between align-items-center mb-2 mt-4 gap-2' }, [
      h('h5', { class: 'fw-semibold mb-0' }, 'Conteos finalizados este mes'),
      outlineButton('Buscar por fecha', 'bi-calendar-range',
        () => router.navigate('#/admin/conteos-finalizados'), 'btn-outline-secondary btn-sm'),
    ]),
    finalizadosWrap,
  );

  // Selector de sucursal: solo tiene sentido si la empresa tiene mas de una.
  async function renderSelector() {
    sucursales = await sucursalesDeMiEmpresa();
    if (sucursales.length <= 1) return;
    clear(selectorWrap);
    const select = h('select', {
      class: 'form-select w-auto',
      onChange: (e) => { sucursalId = Number(e.target.value); setSucursalActiva(sucursalId); refresh(); },
    }, sucursales.map((s) => h('option', {
      value: s.id, selected: Number(s.id) === Number(sucursalId),
    }, esMiSucursal(s.id) ? `${s.nombre} (mi sucursal)` : s.nombre)));
    selectorWrap.append(h('div', { class: 'd-flex align-items-center gap-2' }, [
      h('i', { class: 'bi bi-shop text-muted' }),
      h('label', { class: 'text-muted small mb-0' }, 'Sucursal:'),
      select,
    ]));
  }

  async function refresh() {
    clear(activosWrap); clear(finalizadosWrap);
    activosWrap.append(spinner());
    try {
      const [conteos, finalizados] = await Promise.all([
        api.get(`/conteos/all?sucursalId=${sucursalId}`),
        api.get(`/conteos/finalizados?desde=${inicioDeMes()}&hasta=${hoyStr()}&sucursalId=${sucursalId}`),
      ]);
      const activos = conteos.filter((c) => c.activo && !c.conteoFinalizado);
      clear(activosWrap); clear(finalizadosWrap);
      activosWrap.append(renderActivos(activos));
      finalizadosWrap.append(renderFinalizados(finalizados));
    } catch (err) {
      clear(activosWrap);
      activosWrap.append(h('div', { class: 'alert alert-danger' }, `Error: ${err.message}`));
    }
  }

  const tipoBadge = (c) => badge(c.tipoConteo === 'CATEGORIAS' ? 'Categorías' : 'Libre',
    c.tipoConteo === 'CATEGORIAS' ? 'info' : 'primary');

  // Igual que tipoBadge pero, en CATEGORIAS, agrega los nombres de las categorías contadas.
  const tipoBadgeConCategorias = (c) => {
    if (c.tipoConteo !== 'CATEGORIAS') return badge('Libre', 'primary');
    const cats = (c.categorias && c.categorias.length) ? c.categorias.join(', ') : null;
    return h('span', { class: 'd-inline-flex align-items-center gap-1 flex-wrap' }, [
      badge('Categorías', 'info'),
      cats ? h('span', { class: 'text-muted small' }, `- ${cats}`) : null,
    ]);
  };

  function renderActivos(rows) {
    return dataTable({
      columns: [
        { key: 'id', label: 'ID', render: (r) => `#${r.id}` },
        { key: 'tipoConteo', label: 'Tipo', render: tipoBadge },
        { key: 'fechaHora', label: 'Iniciado', render: (r) => fmt.dateTime(r.fechaHora) },
      ],
      rows, searchKeys: ['id', 'tipoConteo'],
      emptyText: 'No hay conteos activos.',
      actions: [
        { icon: 'bi-box-arrow-in-right', title: 'Unirse', className: 'btn-outline-primary', onClick: (r) => unirse(r) },
        { icon: 'bi-check2-circle', title: 'Finalizar', className: 'btn-outline-success', onClick: (r) => finalizar(r) },
        { icon: 'bi-trash', title: 'Eliminar', className: 'btn-outline-danger', onClick: (r) => eliminar(r) },
      ],
    });
  }

  function renderFinalizados(rows) {
    return dataTable({
      columns: [
        { key: 'id', label: 'ID', render: (r) => `#${r.id}` },
        { key: 'tipoConteo', label: 'Tipo', render: tipoBadgeConCategorias },
        { key: 'fechaHora', label: 'Fecha', render: (r) => fmt.dateTime(r.fechaHora) },
      ],
      rows, searchKeys: ['id', 'tipoConteo'],
      emptyText: 'No hay conteos finalizados este mes.',
      actions: [
        { icon: 'bi-file-earmark-bar-graph', title: 'Ver reporte', className: 'btn-outline-primary', onClick: (r) => router.navigate(`#/admin/reporte-conteo/${r.id}`) },
        { icon: 'bi-arrow-counterclockwise', title: 'Reabrir', className: 'btn-outline-warning', onClick: (r) => reabrirConteo(r) },
      ],
    });
  }

  function unirse(c) {
    const target = c.tipoConteo === 'CATEGORIAS'
      ? `#/admin/gestionar-conteos/unirse-conteo-categorias/${c.id}`
      : `#/admin/gestionar-conteos/unirse-conteo-libre/${c.id}`;
    router.navigate(target);
  }

  /** Campo de sucursal del modal de alta (solo si hay mas de una en la empresa). */
  function campoSucursal(onChange) {
    if (sucursales.length <= 1) return [];
    return [{
      name: 'sucursalId', label: 'Sucursal donde se cuenta', type: 'select', required: true,
      value: sucursalId, colClass: 'col-12',
      options: sucursales.map((s) => ({
        value: s.id, label: esMiSucursal(s.id) ? `${s.nombre} (mi sucursal)` : s.nombre,
      })),
      help: 'Por defecto la tuya. Podés iniciar el conteo en otra sucursal de tu empresa.',
      onChange,
    }];
  }

  async function crearLibre() {
    sucursales = await sucursalesDeMiEmpresa();
    // Con una sola sucursal no hay nada que elegir: se mantiene la confirmacion simple.
    let values = { sucursalId };
    if (sucursales.length > 1) {
      values = await formModal({
        title: 'Nuevo conteo libre', submitText: 'Crear conteo', fields: campoSucursal(),
      });
    } else {
      const ok = await ui.confirm('¿Crear un nuevo conteo libre?', { confirmText: 'Sí, crear', danger: false });
      if (!ok) return;
    }
    if (!values) return;
    ui.loading('Creando conteo...');
    try {
      const usuarioId = await resolveUsuarioId();
      await api.post('/conteos', {
        tipoConteo: 'LIBRE', usuarioId, fechaHora: now(),
        sucursalId: Number(values.sucursalId ?? sucursalId),
      });
      ui.close(); ui.success('Conteo libre creado.'); refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function crearCategorias() {
    sucursales = await sucursalesDeMiEmpresa();
    const cargarCategorias = async (sucId) => {
      const cats = await api.get(`/categorias/sucursal/${sucId}`);
      return cats.map((c) => ({ value: c.id, label: c.nombre }));
    };

    let opciones;
    try { opciones = await cargarCategorias(sucursalId); }
    catch (err) { ui.error(err.message); return; }
    if (opciones.length === 0) { ui.error('Esa sucursal no tiene categorías cargadas.'); return; }

    // Al cambiar la sucursal se repueblan las categorías del checkboxgroup.
    const onCambioSucursal = async (valor, { setOptions }) => {
      try { setOptions('categoriaIds', await cargarCategorias(valor)); }
      catch { setOptions('categoriaIds', []); }
    };

    const values = await formModal({
      title: 'Nuevo conteo por categorías',
      submitText: 'Crear conteo',
      fields: [
        ...campoSucursal(onCambioSucursal),
        {
          name: 'categoriaIds', label: 'Categorías a contar', type: 'checkboxgroup', required: true,
          options: opciones,
          help: 'Elegí una o más categorías. Se cargarán todos sus productos activos.',
        },
      ],
    });
    if (!values) return;
    ui.loading('Creando conteo...');
    try {
      const usuarioId = await resolveUsuarioId();
      await api.post('/conteos/categorias', {
        tipoConteo: 'CATEGORIAS', usuarioId, fechaHora: now(),
        sucursalId: Number(values.sucursalId ?? sucursalId),
        categoriaIds: values.categoriaIds.map(Number),
      });
      ui.close(); ui.success('Conteo por categorías creado.'); refresh();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function finalizar(c) {
    const ok = await ui.confirm(`¿Finalizar el conteo #${c.id}?`, { confirmText: 'Sí, finalizar', danger: false });
    if (!ok) return;
    ui.loading('Finalizando...');
    try { await api.put(`/conteos/${c.id}`, { conteoFinalizado: true }); ui.close(); ui.success('Finalizado.'); refresh(); }
    catch (err) { ui.close(); ui.error(err.message); }
  }

  async function eliminar(c) {
    const ok = await ui.confirm(`¿Eliminar el conteo #${c.id}?`);
    if (!ok) return;
    ui.loading('Eliminando...');
    try { await api.del(`/conteos/${c.id}`); ui.close(); ui.success('Eliminado.'); refresh(); }
    catch (err) { ui.close(); ui.error(err.message); }
  }

  renderSelector();
  refresh();
  // Los eventos son un broadcast global: se ignoran los de otras sucursales.
  const siEsDeEstaSucursal = (payload) => {
    if (payload?.sucursalId && Number(payload.sucursalId) !== Number(sucursalId)) return;
    refresh();
  };
  const u1 = ws.subscribe('conteo-activo', siEsDeEstaSucursal);
  const u2 = ws.subscribe('conteo-finalizado', siEsDeEstaSucursal);
  const dotTimer = setInterval(() => {
    const d = document.getElementById('ws-dot');
    if (d) d.className = 'sk-dot ' + (ws.isConnected() ? 'on' : 'off');
  }, 1500);
  onCleanup(() => { u1(); u2(); clearInterval(dotTimer); });
}

/** Fecha y hora local en formato MySQL (toISOString() da UTC y adelanta el dia de noche). */
function now() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

/** Fecha local YYYY-MM-DD (sin desfase de zona horaria). */
function hoyStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Primer dia del mes actual, en formato YYYY-MM-01. */
function inicioDeMes() {
  return hoyStr().slice(0, 8) + '01';
}
