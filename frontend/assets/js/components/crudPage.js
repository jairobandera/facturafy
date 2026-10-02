// Factory de pagina CRUD: lista con buscador + alta/edicion via modal + baja logica.
import { h, clear } from '../core/dom.js';
import { renderShell } from '../core/layout.js';
import { pageHeader, primaryButton, spinner } from './page.js';
import { dataTable } from './dataTable.js';
import { formModal } from './formModal.js';
import { ui } from '../core/ui.js';

/**
 * @param {object} cfg
 * @param {string} cfg.navTitle           Titulo de la topbar.
 * @param {string} cfg.title              Titulo de la pagina.
 * @param {string} [cfg.subtitle]
 * @param {string} cfg.entityName         Nombre singular ("empresa").
 * @param {()=>Promise<Array>} cfg.load
 * @param {Array} cfg.columns             Columnas de dataTable.
 * @param {Array<string>} [cfg.searchKeys]
 * @param {(row?)=>Promise<Array>|Array} cfg.buildFields  Campos del formulario.
 * @param {(values, row?)=>object} cfg.toDto
 * @param {(dto)=>Promise<any>} cfg.create
 * @param {(id, dto)=>Promise<any>} cfg.update
 * @param {(row)=>Promise<any>} [cfg.remove]
 * @param {(values)=>string|null} [cfg.validate]
 * @param {Array} [cfg.extraActions]      Acciones extra por fila.
 * @param {Node|Array} [cfg.toolbar]      Controles extra en la barra.
 * @param {(row)=>string} [cfg.rowClass]  Clase CSS por fila (para resaltar).
 * @param {Node|Array} [cfg.footer]       Secciones extra debajo de la tabla.
 * @param {(rows)=>void} [cfg.afterRefresh]  Se ejecuta al terminar cada recarga.
 * @param {object} [cfg.openEditId]       Si se pasa, abre edicion de ese id al cargar.
 */
export function crudPage(cfg) {
  const content = renderShell(cfg.navTitle || cfg.title);
  const header = pageHeader(cfg.title, cfg.subtitle, [
    cfg.create ? primaryButton(`Nuevo ${cfg.entityName}`, 'bi-plus-lg', () => openForm()) : null,
  ]);
  content.append(header);
  const tableWrap = h('div');
  content.append(tableWrap);
  if (cfg.footer) content.append(h('div', {}, cfg.footer));

  let rows = [];

  async function refresh() {
    clear(tableWrap);
    const loading = spinner();
    tableWrap.append(loading);
    try {
      rows = await cfg.load();
      clear(tableWrap);
      const actions = [];
      if (cfg.update) actions.push({ icon: 'bi-pencil', title: 'Editar', className: 'btn-outline-primary', onClick: (row) => openForm(row) });
      for (const a of (cfg.extraActions || [])) actions.push(a);
      if (cfg.remove) actions.push({
        icon: 'bi-trash', title: 'Desactivar', className: 'btn-outline-danger',
        show: (row) => row.activo !== false,
        onClick: (row) => onRemove(row),
      });
      tableWrap.append(dataTable({
        columns: cfg.columns, rows, actions,
        searchKeys: cfg.searchKeys, toolbar: cfg.toolbar, rowClass: cfg.rowClass,
        searchPlaceholder: `Buscar ${cfg.entityName}...`,
      }));
    } catch (err) {
      clear(tableWrap);
      tableWrap.append(h('div', { class: 'alert alert-danger' }, `Error al cargar: ${err.message}`));
    }
    if (cfg.afterRefresh) cfg.afterRefresh(rows);
  }

  async function openForm(row = null) {
    let fields;
    try {
      fields = await cfg.buildFields(row);
    } catch (err) { ui.error(`No se pudo abrir el formulario: ${err.message}`); return; }

    const values = await formModal({
      title: row ? `Editar ${cfg.entityName}` : `Nuevo ${cfg.entityName}`,
      fields, validate: cfg.validate,
    });
    if (!values) return;

    ui.loading('Guardando...');
    try {
      const dto = cfg.toDto(values, row);
      if (row) await cfg.update(row.id, dto);
      else await cfg.create(dto);
      ui.close();
      ui.success(row ? 'Actualizado correctamente.' : 'Creado correctamente.');
      await refresh();
    } catch (err) {
      ui.close();
      ui.error(err.message || 'No se pudo guardar.');
    }
  }

  async function onRemove(row) {
    const ok = await ui.confirm(`¿Desactivar este ${cfg.entityName}?`, { confirmText: 'Sí, desactivar' });
    if (!ok) return;
    ui.loading('Desactivando...');
    try {
      await cfg.remove(row);
      ui.close();
      ui.success('Desactivado correctamente.');
      await refresh();
    } catch (err) {
      ui.close();
      ui.error(err.message || 'No se pudo desactivar.');
    }
  }

  refresh().then(() => {
    if (cfg.openEditId) {
      const row = rows.find((r) => String(r.id) === String(cfg.openEditId));
      if (row) openForm(row);
    } else if (cfg.openCreate) {
      openForm();
    }
  });

  return { refresh, openForm };
}
