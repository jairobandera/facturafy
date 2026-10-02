// Tabla de datos con busqueda, paginacion y acciones. Renderiza dentro de un contenedor.
import { h, clear } from '../core/dom.js';

const POR_PAGINA = 20;

/**
 * @param {object} opts
 * @param {Array} opts.columns  [{ key, label, render?(row), className? }]
 * @param {Array} opts.rows
 * @param {Array} [opts.actions]  [{ icon, title, className, onClick(row), show?(row) }]
 * @param {string} [opts.searchPlaceholder]
 * @param {Array<string>} [opts.searchKeys]  claves por las que filtrar
 * @param {Node|Array} [opts.toolbar]  elementos extra a la izquierda del buscador
 * @param {string} [opts.emptyText]
 * @param {(row)=>string} [opts.rowClass]  clase CSS opcional por fila (para resaltar)
 * @param {number} [opts.porPagina]  filas por pagina (0 = sin paginar). Por defecto 20.
 */
export function dataTable(opts) {
  const {
    columns, rows, actions = [], searchPlaceholder = 'Buscar...',
    searchKeys = null, toolbar = null, emptyText = 'No hay registros para mostrar.',
    rowClass = null, porPagina = POR_PAGINA,
  } = opts;

  const state = { term: '', pagina: 1 };
  const tbody = h('tbody');
  const paginacion = h('div', { class: 'sk-paginacion d-flex flex-wrap justify-content-center align-items-center gap-2 mt-3' });

  const search = h('input', {
    class: 'form-control sk-search', type: 'search', placeholder: searchPlaceholder,
    oninput: (e) => { state.term = e.target.value.toLowerCase(); state.pagina = 1; render(); },
  });

  function filtered() {
    if (!state.term) return rows;
    const keys = searchKeys || columns.map((c) => c.key).filter(Boolean);
    return rows.filter((row) =>
      keys.some((k) => String(row[k] ?? '').toLowerCase().includes(state.term)));
  }

  function filaDe(row) {
    const cells = columns.map((c) => {
      const content = c.render ? c.render(row) : row[c.key];
      return h('td', { class: c.className || '' }, content instanceof Node ? content : (content ?? ''));
    });
    if (actions.length) {
      const btns = actions
        .filter((a) => !a.show || a.show(row))
        .map((a) => h('button', {
          class: `btn btn-sm ${a.className || 'btn-outline-primary'} me-1`,
          title: a.title || '', onClick: () => a.onClick(row),
        }, [h('i', { class: `bi ${a.icon}` })]));
      cells.push(h('td', { class: 'text-nowrap text-end' }, btns));
    }
    return h('tr', { class: rowClass ? (rowClass(row) || '') : '' }, cells);
  }

  function render() {
    const lista = filtered();
    const total = lista.length;
    const paginas = porPagina > 0 ? Math.max(1, Math.ceil(total / porPagina)) : 1;
    if (state.pagina > paginas) state.pagina = paginas;
    const desde = porPagina > 0 ? (state.pagina - 1) * porPagina : 0;
    const visibles = porPagina > 0 ? lista.slice(desde, desde + porPagina) : lista;

    clear(tbody);
    if (total === 0) {
      tbody.append(h('tr', {}, [
        h('td', { colspan: columns.length + (actions.length ? 1 : 0), class: 'text-center text-muted py-4' }, emptyText),
      ]));
    } else {
      for (const row of visibles) tbody.append(filaDe(row));
    }
    renderPaginacion(total, paginas, desde, visibles.length);
  }

  function renderPaginacion(total, paginas, desde, enPantalla) {
    clear(paginacion);
    if (porPagina <= 0 || total === 0) return;

    const ir = (p) => { state.pagina = Math.min(Math.max(1, p), paginas); render(); };
    const boton = (texto, destino, { activo = false, deshabilitado = false } = {}) => h('button', {
      class: `btn btn-sm ${activo ? 'btn-primary' : 'btn-outline-secondary'}`,
      disabled: deshabilitado || undefined,
      onClick: () => ir(destino),
    }, texto);

    // El contador va en su propia linea para que los botones queden centrados.
    paginacion.append(h('div', { class: 'w-100 text-center text-muted small' },
      `Mostrando ${desde + 1}-${desde + enPantalla} de ${total}`));

    if (paginas <= 1) return;
    paginacion.append(boton('«', 1, { deshabilitado: state.pagina === 1 }));
    paginacion.append(boton('‹', state.pagina - 1, { deshabilitado: state.pagina === 1 }));
    // Ventana de paginas alrededor de la actual, para no listar 60 botones.
    const inicio = Math.max(1, Math.min(state.pagina - 2, paginas - 4));
    const fin = Math.min(paginas, inicio + 4);
    for (let p = inicio; p <= fin; p++) paginacion.append(boton(String(p), p, { activo: p === state.pagina }));
    paginacion.append(boton('›', state.pagina + 1, { deshabilitado: state.pagina === paginas }));
    paginacion.append(boton('»', paginas, { deshabilitado: state.pagina === paginas }));
  }

  render();

  const head = h('thead', {}, [
    h('tr', {}, [
      ...columns.map((c) => h('th', {}, c.label)),
      actions.length ? h('th', { class: 'text-end' }, 'Acciones') : null,
    ]),
  ]);

  return h('div', {}, [
    h('div', { class: 'sk-table-toolbar' }, [
      toolbar,
      h('div', { class: 'ms-auto' }, [search]),
    ]),
    h('div', { class: 'sk-card p-0' }, [
      h('div', { class: 'table-responsive' }, [
        h('table', { class: 'table table-hover align-middle mb-0' }, [head, tbody]),
      ]),
    ]),
    paginacion,
  ]);
}
