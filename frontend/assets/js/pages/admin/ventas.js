// Ventas realizadas (administrador): historial con filtros, detalle y anulacion.
// Anular pide un motivo obligatorio y el backend devuelve el stock de cada renglon.
import { h, clear, esc } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, primaryButton, spinner, badge } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { sucursalSelect } from '../../components/sucursalSelect.js';
import { resolveUsuarioId } from '../shared/session.js';

const Swal = window.Swal;

export function ventasPage() {
  const content = renderShell('Ventas realizadas');
  content.append(pageHeader('Ventas realizadas', 'Historial de ventas de la sucursal.'));

  const hoy = new Date();
  const haceUnMes = new Date(); haceUnMes.setMonth(hoy.getMonth() - 1);
  const desdeInput = h('input', { class: 'form-control', type: 'date', value: iso(haceUnMes) });
  const hastaInput = h('input', { class: 'form-control', type: 'date', value: iso(hoy) });
  const estadoInput = h('select', { class: 'form-select' }, [
    h('option', { value: '' }, 'Todas'),
    h('option', { value: 'EMITIDA' }, 'Emitidas'),
    h('option', { value: 'ANULADA' }, 'Anuladas'),
  ]);

  content.append(h('div', { class: 'sk-card p-3 mb-3' }, [
    sucursalSelect(() => load()),
    h('div', { class: 'row g-3 align-items-end mt-0' }, [
      h('div', { class: 'col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Desde'), desdeInput]),
      h('div', { class: 'col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Hasta'), hastaInput]),
      h('div', { class: 'col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Estado'), estadoInput]),
      h('div', { class: 'col-md-3' }, [primaryButton('Actualizar', 'bi-arrow-clockwise', () => load())]),
    ]),
  ]));

  const tableWrap = h('div');
  content.append(tableWrap);

  async function load() {
    clear(tableWrap);
    const loading = spinner('Cargando ventas...');
    tableWrap.append(loading);
    const sucursalId = sucursalActiva();
    const qs = new URLSearchParams();
    if (desdeInput.value) qs.set('desde', desdeInput.value);
    if (hastaInput.value) qs.set('hasta', hastaInput.value);
    if (estadoInput.value) qs.set('estado', estadoInput.value);
    try {
      const ventas = await api.get(`/ventas/sucursal/${sucursalId}?${qs.toString()}`);
      clear(tableWrap);
      tableWrap.append(dataTable({
        columns: [
          { key: 'id', label: '#' },
          { key: 'fechaHora', label: 'Fecha', render: (v) => fmt.dateTime(v.fechaHora) },
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
          { icon: 'bi-x-circle', title: 'Anular', className: 'btn-outline-danger',
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
      : `${esc(v.clienteRazonSocial || '')}${v.clienteRut ? ' (RUT ' + esc(v.clienteRut) + ')' : ''}`;
    const anulada = v.estado === 'ANULADA'
      ? `<div class="alert alert-danger py-2 mt-2 mb-0 text-start"><b>Anulada:</b> ${esc(v.motivoAnulacion || '')}<br>
         <small>${esc(fmt.dateTime(v.fechaAnulacion))}</small></div>` : '';
    Swal.fire({
      title: `Venta #${v.id}`,
      html: `
        <div class="text-start small mb-2">
          <div><b>Fecha:</b> ${esc(fmt.dateTime(v.fechaHora))}</div>
          <div><b>Cliente:</b> ${quien}</div>
          <div><b>Forma de pago:</b> ${v.formaPago === 'CREDITO' ? 'Crédito' : 'Contado'}</div>
        </div>
        <div class="table-responsive"><table class="table table-sm">
          <thead><tr><th class="text-start">Producto</th><th class="text-center">Cant.</th>
          <th class="text-end">Precio</th><th class="text-end">Subtotal</th></tr></thead>
          <tbody>${filas}</tbody>
        </table></div>
        <div class="text-end fw-bold">Total: ${esc(fmt.money(v.total))}</div>
        ${anulada}`,
      width: 600, confirmButtonText: 'Cerrar', confirmButtonColor: '#2563eb',
    });
  }

  async function anular(v) {
    const { value: motivo, isConfirmed } = await Swal.fire({
      title: `Anular venta #${v.id}`,
      input: 'textarea', inputPlaceholder: 'Motivo de la anulación (obligatorio)...',
      inputAttributes: { 'aria-label': 'Motivo' },
      showCancelButton: true, confirmButtonText: 'Anular venta', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626', cancelButtonColor: '#64748b',
      inputValidator: (val) => (!val || !val.trim()) ? 'El motivo es obligatorio.' : undefined,
    });
    if (!isConfirmed) return;
    ui.loading('Anulando...');
    try {
      const usuarioId = await resolveUsuarioId();
      await api.post(`/ventas/${v.id}/anular`, { motivo: motivo.trim(), usuarioId });
      ui.close();
      ui.success('Venta anulada. El stock fue devuelto.');
      await load();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  load();
}

function iso(d) { return d.toISOString().slice(0, 10); }
