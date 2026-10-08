// Historial de envíos de quincena (paquete "Solo envío de correos").
import { h, clear, esc } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, badge, primaryButton } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { sucursalSelect } from '../../components/sucursalSelect.js';

const Swal = window.Swal;

const ESTADO = {
  ENVIADO: { label: 'Enviado', color: 'success' },
  FALLIDO: { label: 'Fallido', color: 'danger' },
  SIN_CONTACTO: { label: 'Sin contacto', color: 'warning' },
};

export function correosHistorialPage() {
  const content = renderShell('Historial de envíos');
  content.append(pageHeader('Historial de envíos', 'Envíos de quincena realizados en la sucursal.'));

  content.append(h('div', { class: 'sk-card p-3 mb-3' }, [
    sucursalSelect(() => load()),
    h('div', { class: 'd-flex justify-content-end mt-2' }, primaryButton('Actualizar', 'bi-arrow-clockwise', () => load())),
  ]));

  const tableWrap = h('div');
  content.append(tableWrap);

  async function verDetalle(e) {
    ui.loading('Cargando detalle...');
    let data;
    try { data = await api.get(`/envio-correos/${e.id}`); }
    catch (err) { ui.close(); ui.error(err.message); return; }
    ui.close();
    const filas = (data.detalle || []).map((d) => {
      const est = ESTADO[d.estado] || { label: d.estado, color: 'secondary' };
      return `<tr>
        <td class="text-start">${esc(d.nombre || d.clave || '')}</td>
        <td class="text-start">${esc(d.email || '-')}</td>
        <td class="text-end">${esc(fmt.money(d.monto))}</td>
        <td class="text-center"><span class="badge text-bg-${est.color}">${esc(est.label)}</span></td>
      </tr>`;
    }).join('');
    Swal.fire({
      title: `Envío #${e.id}`,
      html: `<div class="table-responsive"><table class="table table-sm">
          <thead><tr><th class="text-start">Cliente</th><th class="text-start">Email</th>
          <th class="text-end">Monto</th><th class="text-center">Estado</th></tr></thead>
          <tbody>${filas || '<tr><td colspan="4" class="text-muted">Sin destinatarios.</td></tr>'}</tbody>
        </table></div>`,
      width: 640, confirmButtonText: 'Cerrar', confirmButtonColor: '#2563eb',
    });
  }

  async function load() {
    clear(tableWrap);
    const sp = spinner('Cargando historial...');
    tableWrap.append(sp);
    try {
      const rows = await api.get(`/envio-correos/sucursal/${sucursalActiva()}`);
      clear(tableWrap);
      if (!rows.length) {
        tableWrap.append(h('div', { class: 'sk-card p-4 text-center text-muted' }, 'Todavía no hay envíos.'));
        return;
      }
      tableWrap.append(dataTable({
        columns: [
          { key: 'id', label: '#' },
          { key: 'fecha', label: 'Fecha', render: (r) => fmt.dateTime(r.fecha) },
          { key: 'asunto', label: 'Asunto', render: (r) => r.asunto || '-' },
          { key: 'periodo', label: 'Período', render: (r) => (r.periodoDesde || r.periodoHasta) ? `${fmt.date(r.periodoDesde)} a ${fmt.date(r.periodoHasta)}` : '-' },
          { key: 'enviados', label: 'Enviados', className: 'text-center', render: (r) => badge(String(r.enviados), 'success') },
          { key: 'fallidos', label: 'Fallidos', className: 'text-center', render: (r) => badge(String(r.fallidos), r.fallidos ? 'danger' : 'secondary') },
          { key: 'sinContacto', label: 'Sin contacto', className: 'text-center', render: (r) => badge(String(r.sinContacto), r.sinContacto ? 'warning' : 'secondary') },
        ],
        rows,
        searchKeys: ['id', 'asunto'],
        actions: [{ icon: 'bi-eye', title: 'Ver detalle', className: 'btn-outline-primary', onClick: verDetalle }],
      }));
    } catch (err) {
      clear(tableWrap);
      tableWrap.append(h('div', { class: 'alert alert-danger' }, `Error al cargar: ${err.message}`));
    }
  }

  load();
}
