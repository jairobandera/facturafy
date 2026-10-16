// Códigos de descuento (administrador): códigos de UN SOLO USO que el cajero aplica en
// el POS (un % o un monto fijo sobre el total). Por sucursal, con vencimiento opcional y
// baja manual. Para cualquier paquete con facturación. El admin ve si están vigentes/usados/vencidos.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, badge, primaryButton } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { formModal } from '../../components/formModal.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { sucursalSelect } from '../../components/sucursalSelect.js';

const ESTADO_BADGE = {
  VIGENTE: ['Vigente', 'success'],
  USADO: ['Usado', 'secondary'],
  VENCIDO: ['Vencido', 'warning'],
  PROGRAMADO: ['Programado', 'info'],
};

function valorTexto(r) {
  return r.tipo === 'PORCENTAJE' ? `${r.valor}%` : fmt.money(r.valor);
}

function vigenciaTexto(r) {
  const d = r.fechaDesde ? fmt.date(r.fechaDesde) : null;
  const hh = r.fechaHasta ? fmt.date(r.fechaHasta) : null;
  if (d && hh) return `${d} → ${hh}`;
  if (hh) return `vence ${hh}`;
  if (d) return `desde ${d}`;
  return 'Sin vencimiento';
}

export function descuentosPage() {
  const content = renderShell('Códigos de descuento');
  content.append(pageHeader('Códigos de descuento', 'Códigos de un solo uso que el cajero aplica en el punto de venta.'));

  content.append(h('div', { class: 'sk-card p-3 mb-3' }, [
    sucursalSelect(() => load()),
    h('div', { class: 'd-flex flex-wrap gap-2 mt-2' }, [
      primaryButton('Nuevo código', 'bi-plus-lg', crear),
    ]),
  ]));

  const tableWrap = h('div');
  content.append(tableWrap);

  async function crear() {
    const v = await formModal({
      title: 'Nuevo código de descuento',
      submitText: 'Crear',
      fields: [
        { name: 'codigo', label: 'Código', required: true, colClass: 'col-md-6', placeholder: 'Ej: VERANO10', autocomplete: 'off' },
        { name: 'tipo', label: 'Tipo', type: 'select', colClass: 'col-md-6', value: 'PORCENTAJE',
          options: [{ value: 'PORCENTAJE', label: 'Porcentaje (%)' }, { value: 'MONTO', label: 'Monto fijo ($)' }] },
        { name: 'valor', label: 'Valor (% o $ según el tipo)', type: 'number', required: true, min: 0, step: '0.01', colClass: 'col-md-6' },
        { name: 'fechaDesde', label: 'Desde (opcional)', type: 'date', colClass: 'col-md-3' },
        { name: 'fechaHasta', label: 'Vence (opcional)', type: 'date', colClass: 'col-md-3' },
      ],
      validate: (vals) => {
        if (!Number.isFinite(vals.valor) || vals.valor <= 0) return 'El valor debe ser mayor a 0.';
        if (vals.tipo === 'PORCENTAJE' && vals.valor > 100) return 'El porcentaje no puede superar 100.';
        if (vals.fechaDesde && vals.fechaHasta && vals.fechaHasta < vals.fechaDesde) return 'La fecha "vence" no puede ser anterior a "desde".';
        return null;
      },
    });
    if (!v) return;
    ui.loading('Creando...');
    try {
      await api.post('/descuentos', {
        sucursalId: sucursalActiva(), codigo: v.codigo, tipo: v.tipo, valor: v.valor,
        fechaDesde: v.fechaDesde || null, fechaHasta: v.fechaHasta || null,
      });
      ui.close();
      ui.success('Código creado.');
      await load();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function darDeBaja(r) {
    const ok = await ui.confirm(`¿Dar de baja el código "${r.codigo}"? No se podrá usar más.`, { confirmText: 'Dar de baja' });
    if (!ok) return;
    ui.loading('Dando de baja...');
    try { await api.del(`/descuentos/${r.id}`); ui.close(); await load(); }
    catch (err) { ui.close(); ui.error(err.message); }
  }

  async function load() {
    clear(tableWrap);
    const sp = spinner('Cargando códigos...');
    tableWrap.append(sp);
    try {
      const rows = await api.get(`/descuentos/sucursal/${sucursalActiva()}`);
      clear(tableWrap);
      if (!rows.length) {
        tableWrap.append(h('div', { class: 'sk-card p-4 text-center text-muted' },
          'Todavía no hay códigos. Creá uno con "Nuevo código".'));
        return;
      }
      tableWrap.append(dataTable({
        columns: [
          { key: 'codigo', label: 'Código' },
          { key: 'tipo', label: 'Descuento', render: (r) => valorTexto(r) },
          { key: 'vigencia', label: 'Vigencia', render: (r) => vigenciaTexto(r) },
          { key: 'estado', label: 'Estado', render: (r) => { const [t, c] = ESTADO_BADGE[r.estado] || [r.estado, 'secondary']; return badge(t, c); } },
          { key: 'usadoFecha', label: 'Usado el', render: (r) => (r.usado && r.usadoFecha) ? fmt.dateTime(r.usadoFecha) : '-' },
        ],
        rows,
        searchKeys: ['codigo'],
        actions: [
          { icon: 'bi-trash', title: 'Dar de baja', className: 'btn-outline-danger', onClick: darDeBaja, show: (r) => r.activo },
        ],
      }));
    } catch (err) {
      clear(tableWrap);
      tableWrap.append(h('div', { class: 'alert alert-danger' }, `Error al cargar: ${err.message}`));
    }
  }

  load();
}
