// Ventas del turno (cajero): lista las ventas del turno abierto y permite anularlas.
// Anular pide un motivo y el PIN de autorizacion de la sucursal (lo da el supervisor).
import { h, clear, esc } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { router } from '../../core/router.js';
import { pageHeader, spinner, badge, primaryButton } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { cargarTurnoActivo, soyMiembro } from '../../core/turno.js';
import { resolveUsuarioId } from '../shared/session.js';

const Swal = window.Swal;

export async function ventasTurnoPage() {
  const content = renderShell('Ventas del turno');
  const sucursalId = sucursalActiva();

  const loading = spinner('Cargando turno...');
  content.append(loading);

  let usuarioId = null;
  let turno = null;
  try {
    [usuarioId, turno] = await Promise.all([resolveUsuarioId(), cargarTurnoActivo(sucursalId)]);
  } catch (err) {
    loading.remove();
    content.append(h('div', { class: 'alert alert-danger' }, `No se pudo cargar: ${err.message}`));
    return;
  }
  loading.remove();

  if (!turno || !soyMiembro(turno, usuarioId)) {
    ui.info('Turno no iniciado', 'Tenés que iniciar o unirte a un turno de caja.');
    router.navigate('/facturacion/dashboard');
    return;
  }

  content.append(pageHeader('Ventas del turno', `Turno ${turno.numeroLabel} · desde ${fmt.dateTime(turno.fechaApertura)}`,
    [primaryButton('Actualizar', 'bi-arrow-clockwise', () => load())]));

  const tableWrap = h('div');
  content.append(tableWrap);

  async function load() {
    clear(tableWrap);
    const sp = spinner('Cargando ventas...');
    tableWrap.append(sp);
    try {
      const ventas = await api.get(`/ventas/turno/${turno.id}`);
      clear(tableWrap);
      if (!ventas.length) {
        tableWrap.append(h('div', { class: 'sk-card p-4 text-center text-muted' }, 'Todavía no hay ventas en este turno.'));
        return;
      }
      tableWrap.append(dataTable({
        columns: [
          { key: 'id', label: '#' },
          { key: 'fechaHora', label: 'Hora', render: (v) => fmt.dateTime(v.fechaHora) },
          { key: 'cliente', label: 'Cliente', render: (v) => v.consumidorFinal
            ? h('span', { class: 'text-muted' }, 'Consumidor final')
            : (v.clienteRazonSocial || `Cliente #${v.clienteId}`) },
          { key: 'formaPago', label: 'Pago', render: (v) => badge(v.formaPago === 'CREDITO' ? 'Crédito' : 'Contado',
            v.formaPago === 'CREDITO' ? 'warning' : 'secondary') },
          { key: 'total', label: 'Total', className: 'text-end', render: (v) => fmt.money(v.total) },
          { key: 'estado', label: 'Estado', render: (v) => badge(v.estado === 'ANULADA' ? 'Anulada' : 'Emitida',
            v.estado === 'ANULADA' ? 'danger' : 'success') },
        ],
        rows: ventas,
        searchKeys: ['id', 'clienteRazonSocial', 'clienteRut'],
        rowClass: (v) => v.estado === 'ANULADA' ? 'text-muted' : '',
        actions: [
          { icon: 'bi-eye', title: 'Ver detalle', className: 'btn-outline-primary', onClick: verDetalle },
          { icon: 'bi-x-circle', title: 'Eliminar venta', className: 'btn-outline-danger',
            show: (v) => v.estado === 'EMITIDA', onClick: anular },
        ],
      }));
    } catch (err) {
      clear(tableWrap);
      tableWrap.append(h('div', { class: 'alert alert-danger' }, `Error al cargar: ${err.message}`));
    }
  }

  function verDetalle(v) {
    const filas = (v.detalles || []).map((d) =>
      `<tr><td class="text-start">${esc(d.nombre)}</td><td class="text-center">${esc(d.cantidad)}</td>
       <td class="text-end">${esc(fmt.money(d.precioUnitario))}</td><td class="text-end">${esc(fmt.money(d.subtotal))}</td></tr>`).join('');
    const quien = v.consumidorFinal ? 'Consumidor final'
      : `${esc(v.clienteRazonSocial || '')}${v.clienteRut ? ' (' + esc(v.clienteTipoDocumento || 'RUT') + ' ' + esc(v.clienteRut) + ')' : ''}`;
    Swal.fire({
      title: `Venta #${v.id}`,
      html: `
        <div class="text-start small mb-2">
          <div><b>Hora:</b> ${esc(fmt.dateTime(v.fechaHora))}</div>
          <div><b>Cliente:</b> ${quien}</div>
          <div><b>Forma de pago:</b> ${v.formaPago === 'CREDITO' ? 'Crédito' : 'Contado'}</div>
        </div>
        <div class="table-responsive"><table class="table table-sm">
          <thead><tr><th class="text-start">Producto</th><th class="text-center">Cant.</th>
          <th class="text-end">Precio</th><th class="text-end">Subtotal</th></tr></thead>
          <tbody>${filas}</tbody>
        </table></div>
        <div class="text-end fw-bold">Total: ${esc(fmt.money(v.total))}</div>`,
      width: 600, confirmButtonText: 'Cerrar', confirmButtonColor: '#2563eb',
    });
  }

  // Eliminar (anular) venta: motivo + PIN del supervisor. El backend devuelve el stock.
  async function anular(v) {
    const { value, isConfirmed } = await Swal.fire({
      title: `Eliminar venta #${v.id}`,
      html: `
        <p class="small text-muted mb-2">Pedile el PIN de autorización a un supervisor (administrador).</p>
        <textarea id="sk-anular-motivo" class="form-control mb-2" placeholder="Motivo de la cancelación (obligatorio)"></textarea>
        <input id="sk-anular-pin" type="password" class="form-control" placeholder="PIN de autorización" autocomplete="off" inputmode="numeric" />`,
      showCancelButton: true, confirmButtonText: 'Eliminar venta', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626', cancelButtonColor: '#64748b', focusConfirm: false,
      didOpen: () => { document.getElementById('sk-anular-motivo')?.focus(); },
      preConfirm: () => {
        const motivo = document.getElementById('sk-anular-motivo').value.trim();
        const pin = document.getElementById('sk-anular-pin').value.trim();
        if (!motivo) { Swal.showValidationMessage('El motivo es obligatorio.'); return false; }
        if (!pin) { Swal.showValidationMessage('Ingresá el PIN de autorización.'); return false; }
        return { motivo, pin };
      },
    });
    if (!isConfirmed) return;
    ui.loading('Eliminando venta...');
    try {
      await api.post(`/ventas/${v.id}/anular`, { motivo: value.motivo, pin: value.pin, usuarioId });
      ui.close();
      ui.success('Venta eliminada. El stock fue devuelto.');
      await load();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  load();
}
