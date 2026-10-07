// Turnos de caja (administrador): historial de turnos de la sucursal, con el reporte
// de arqueo de cada uno y la posibilidad de cerrar un turno abierto.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, badge, primaryButton } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { sucursalSelect } from '../../components/sucursalSelect.js';
import { resolveUsuarioId } from '../shared/session.js';
import { tarjetaArqueo, arqueoPDF } from '../shared/arqueo.js';

const Swal = window.Swal;

export function turnosAdminPage() {
  const content = renderShell('Turnos');
  content.append(pageHeader('Turnos de caja', 'Historial de turnos y arqueo de la sucursal.'));

  content.append(h('div', { class: 'sk-card p-3 mb-3' }, [
    sucursalSelect(() => load()),
    h('div', { class: 'd-flex justify-content-end mt-2' }, primaryButton('Actualizar', 'bi-arrow-clockwise', () => load())),
  ]));

  const tableWrap = h('div');
  content.append(tableWrap);

  async function load() {
    clear(tableWrap);
    const sp = spinner('Cargando turnos...');
    tableWrap.append(sp);
    const sucursalId = sucursalActiva();
    try {
      const turnos = await api.get(`/turnos/sucursal/${sucursalId}`);
      clear(tableWrap);
      if (!turnos.length) {
        tableWrap.append(h('div', { class: 'sk-card p-4 text-center text-muted' }, 'No hay turnos registrados en esta sucursal.'));
        return;
      }
      tableWrap.append(dataTable({
        columns: [
          { key: 'id', label: '#' },
          { key: 'numeroLabel', label: 'Turno' },
          { key: 'estado', label: 'Estado', render: (t) => badge(t.estado === 'CERRADO' ? 'Cerrado' : 'Abierto', t.estado === 'CERRADO' ? 'secondary' : 'success') },
          { key: 'fechaApertura', label: 'Apertura', render: (t) => fmt.dateTime(t.fechaApertura) },
          { key: 'fechaCierre', label: 'Cierre', render: (t) => t.fechaCierre ? fmt.dateTime(t.fechaCierre) : '-' },
          { key: 'responsable', label: 'Responsable', render: (t) => t.responsableNombre
            ? `${t.responsableNombre} ${t.responsableApellido || ''}`.trim() : h('span', { class: 'text-muted' }, 'Sin responsable') },
        ],
        rows: turnos,
        searchKeys: ['id', 'numeroLabel', 'responsableNombre'],
        actions: [
          { icon: 'bi-cash-stack', title: 'Ver arqueo', className: 'btn-outline-primary', onClick: verArqueo },
          { icon: 'bi-door-closed', title: 'Cerrar turno', className: 'btn-outline-danger',
            show: (t) => t.estado === 'ABIERTO', onClick: cerrar },
        ],
      }));
    } catch (err) {
      clear(tableWrap);
      tableWrap.append(h('div', { class: 'alert alert-danger' }, `Error al cargar: ${err.message}`));
    }
  }

  async function verArqueo(t) {
    ui.loading('Cargando arqueo...');
    let reporte;
    try { reporte = await api.get(`/turnos/${t.id}/reporte`); }
    catch (err) { ui.close(); ui.error(err.message); return; }
    ui.close();
    const res = await Swal.fire({
      html: tarjetaArqueo(reporte, `Arqueo del turno #${t.id}`),
      width: 680, showCancelButton: true, confirmButtonText: 'Descargar PDF', cancelButtonText: 'Cerrar',
      confirmButtonColor: '#2563eb', cancelButtonColor: '#64748b',
    });
    if (res.isConfirmed) arqueoPDF(reporte);
  }

  async function cerrar(t) {
    const { value: observaciones, isConfirmed } = await Swal.fire({
      title: `Cerrar turno #${t.id}`,
      html: '<p class="small text-muted mb-2">Al cerrar, el turno deja de recibir ventas.</p>',
      input: 'textarea', inputPlaceholder: 'Observaciones del cierre (opcional)...',
      showCancelButton: true, confirmButtonText: 'Cerrar turno', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626', cancelButtonColor: '#64748b',
    });
    if (!isConfirmed) return;
    ui.loading('Cerrando turno...');
    try {
      const usuarioId = await resolveUsuarioId();
      const final = await api.post(`/turnos/${t.id}/cerrar`, { usuarioId, observaciones: observaciones || null });
      ui.close();
      await load();
      const res = await Swal.fire({
        html: tarjetaArqueo(final, `Arqueo del turno #${t.id} (cerrado)`),
        width: 680, showCancelButton: true, confirmButtonText: 'Descargar PDF', cancelButtonText: 'Listo',
        confirmButtonColor: '#2563eb', cancelButtonColor: '#64748b',
      });
      if (res.isConfirmed) arqueoPDF(final);
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  load();
}
