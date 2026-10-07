// Cuenta corriente de un cliente (administrador): informe de facturas, productos
// comprados, resumen de gastos y deuda, movimientos (cargos/pagos/mora), impresión de
// boleta, registro de pagos, cargos por mora, límite de crédito y envío del estado de
// cuenta por correo.
import { h, clear, esc } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { router } from '../../core/router.js';
import { pageHeader, spinner, badge } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { formModal } from '../../components/formModal.js';
import { resolveUsuarioId } from '../shared/session.js';

const Swal = window.Swal;

const TIPO_MOV = {
  CARGO_VENTA: { label: 'Venta a crédito', color: 'secondary' },
  CARGO_MORA: { label: 'Mora', color: 'danger' },
  PAGO: { label: 'Pago', color: 'success' },
};

export async function clienteCuentaPage(ctx) {
  const clienteId = ctx.params.id;
  const content = renderShell('Cuenta corriente');

  const loading = spinner('Cargando cuenta...');
  content.append(loading);

  let usuarioId = null;
  try { usuarioId = await resolveUsuarioId(); } catch { /* opcional */ }

  const wrap = h('div');

  async function recargar() {
    clear(wrap);
    const sp = spinner('Cargando...');
    wrap.append(sp);
    let resumen, ventas;
    try {
      [resumen, ventas] = await Promise.all([
        api.get(`/clientes/${clienteId}/cuenta`),
        api.get(`/ventas/cliente/${clienteId}`),
      ]);
    } catch (err) {
      clear(wrap);
      wrap.append(h('div', { class: 'alert alert-danger' }, `Error: ${err.message}`));
      return;
    }
    clear(wrap);
    render(resumen, ventas);
  }

  function render(resumen, ventas) {
    const c = resumen.cliente;
    const totalFacturado = ventas.filter((v) => v.estado !== 'ANULADA').reduce((a, v) => a + Number(v.total), 0);

    // Resumen de gastos / deuda
    const tiles = h('div', { class: 'row g-3 mb-3' }, [
      tile('Total facturado', fmt.money(totalFacturado), 'bi-receipt', '#2563eb'),
      tile('A crédito', fmt.money(resumen.totales.cargosVenta), 'bi-credit-card', '#7c3aed'),
      tile('Pagado', fmt.money(resumen.totales.pagos), 'bi-cash-coin', '#16a34a'),
      tile('Mora', fmt.money(resumen.totales.cargosMora), 'bi-exclamation-triangle', '#f59e0b'),
      tile('Debe (saldo)', fmt.money(resumen.saldo), 'bi-wallet2', '#dc2626'),
      tile('Límite', resumen.limite > 0 ? fmt.money(resumen.limite) : 'Sin límite', 'bi-speedometer', '#0891b2'),
    ]);

    // Acciones
    const acciones = h('div', { class: 'sk-card p-3 mb-3 d-flex flex-wrap gap-2' }, [
      h('button', { class: 'btn btn-success', onClick: () => registrarPago(resumen) }, [h('i', { class: 'bi bi-cash-coin me-1' }), 'Registrar pago']),
      h('button', { class: 'btn btn-outline-warning', onClick: () => aplicarMora(resumen) }, [h('i', { class: 'bi bi-exclamation-triangle me-1' }), 'Aplicar mora']),
      h('button', { class: 'btn btn-outline-primary', onClick: () => editarLimite(resumen) }, [h('i', { class: 'bi bi-speedometer me-1' }), 'Editar límite']),
      h('button', { class: 'btn btn-outline-secondary', onClick: () => enviarEstado(resumen) }, [h('i', { class: 'bi bi-envelope-paper me-1' }), 'Enviar estado de cuenta']),
    ]);

    const disponibleNota = resumen.limite > 0
      ? h('div', { class: 'text-muted small mb-3' }, `Crédito disponible: ${fmt.money(Math.max(0, resumen.disponible))}.`)
      : null;

    // Facturas del cliente
    const facturas = ventas.length
      ? dataTable({
        columns: [
          { key: 'id', label: '#' },
          { key: 'fechaHora', label: 'Fecha', render: (v) => fmt.dateTime(v.fechaHora) },
          { key: 'formaPago', label: 'Pago', render: (v) => badge(v.formaPago === 'CREDITO' ? 'Crédito' : 'Contado', v.formaPago === 'CREDITO' ? 'warning' : 'secondary') },
          { key: 'total', label: 'Total', className: 'text-end', render: (v) => fmt.money(v.total) },
          { key: 'estado', label: 'Estado', render: (v) => badge(v.estado === 'ANULADA' ? 'Anulada' : 'Emitida', v.estado === 'ANULADA' ? 'danger' : 'success') },
        ],
        rows: ventas,
        searchKeys: ['id'],
        rowClass: (v) => v.estado === 'ANULADA' ? 'text-muted' : '',
        actions: [
          { icon: 'bi-eye', title: 'Ver productos', className: 'btn-outline-primary', onClick: (v) => verDetalle(v, c) },
          { icon: 'bi-printer', title: 'Imprimir boleta', className: 'btn-outline-secondary', onClick: (v) => boletaPDF(v, c) },
        ],
      })
      : h('div', { class: 'sk-card p-4 text-center text-muted' }, 'Este cliente no tiene facturas.');

    // Movimientos de cuenta corriente
    const movs = resumen.movimientos.length
      ? dataTable({
        columns: [
          { key: 'fecha', label: 'Fecha', render: (m) => fmt.dateTime(m.fecha) },
          { key: 'tipo', label: 'Tipo', render: (m) => badge((TIPO_MOV[m.tipo] || {}).label || m.tipo, (TIPO_MOV[m.tipo] || {}).color || 'secondary') },
          { key: 'descripcion', label: 'Detalle', render: (m) => m.descripcion || '-' },
          { key: 'monto', label: 'Monto', className: 'text-end', render: (m) => (m.tipo === 'PAGO' ? '-' : '+') + fmt.money(m.monto) },
        ],
        rows: resumen.movimientos.slice().reverse(),
        searchKeys: ['descripcion', 'tipo'],
      })
      : h('div', { class: 'sk-card p-4 text-center text-muted' }, 'Sin movimientos en la cuenta corriente.');

    wrap.append(
      tiles,
      disponibleNota,
      acciones,
      h('h6', { class: 'mb-2' }, 'Facturas'),
      facturas,
      h('h6', { class: 'mb-2 mt-4' }, 'Movimientos de cuenta corriente'),
      movs,
    );
  }

  // -------- Acciones --------
  async function registrarPago(resumen) {
    const { value, isConfirmed } = await Swal.fire({
      title: 'Registrar pago',
      html: `<p class="small text-muted mb-2">Saldo actual: <b>${esc(fmt.money(resumen.saldo))}</b></p>
             <input id="pg-monto" type="number" min="0" step="0.01" class="form-control mb-2" placeholder="Monto del pago" />
             <input id="pg-nota" type="text" class="form-control" placeholder="Nota (opcional)" />`,
      showCancelButton: true, confirmButtonText: 'Registrar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a', cancelButtonColor: '#64748b', focusConfirm: false,
      preConfirm: () => {
        const monto = Number(document.getElementById('pg-monto').value);
        if (!Number.isFinite(monto) || monto <= 0) { Swal.showValidationMessage('Ingresá un monto válido.'); return false; }
        return { monto, nota: document.getElementById('pg-nota').value.trim() };
      },
    });
    if (!isConfirmed) return;
    ui.loading('Registrando pago...');
    try {
      await api.post(`/clientes/${clienteId}/pagos`, { monto: value.monto, nota: value.nota || null, usuarioId });
      ui.close(); ui.success('Pago registrado.');
      await recargar();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function aplicarMora(resumen) {
    const v = await formModal({
      title: 'Aplicar cargo por mora', submitText: 'Aplicar',
      fields: [
        { name: 'modo', label: 'Tipo de cargo', type: 'radiogroup', value: 'FIJO', colClass: 'col-12',
          options: [{ value: 'FIJO', label: 'Monto fijo ($)' }, { value: 'PORCENTAJE', label: 'Porcentaje del saldo (%)' }] },
        { name: 'valor', label: 'Valor', type: 'number', min: 0, step: '0.01', required: true, colClass: 'col-md-6',
          help: `Saldo actual: ${fmt.money(resumen.saldo)}` },
        { name: 'nota', label: 'Nota', colClass: 'col-md-6' },
      ],
    });
    if (!v) return;
    ui.loading('Aplicando mora...');
    try {
      await api.post(`/clientes/${clienteId}/mora`, { modo: v.modo, valor: Number(v.valor), nota: v.nota || null, usuarioId });
      ui.close(); ui.success('Cargo por mora aplicado.');
      await recargar();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function editarLimite(resumen) {
    const { value, isConfirmed } = await Swal.fire({
      title: 'Límite de crédito',
      input: 'number', inputValue: resumen.limite || 0,
      inputAttributes: { min: 0, step: '0.01' },
      text: '0 = sin límite.',
      showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb', cancelButtonColor: '#64748b',
      inputValidator: (val) => (val === '' || Number(val) < 0) ? 'Ingresá 0 o un monto positivo.' : undefined,
    });
    if (!isConfirmed) return;
    ui.loading('Guardando...');
    try {
      await api.put(`/clientes/${clienteId}/limite`, { limiteCredito: Number(value) });
      ui.close(); ui.success('Límite actualizado.');
      await recargar();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function enviarEstado(resumen) {
    const correo = await api.get(`/sucursales/${resumen.cliente.sucursalId}/smtp`).catch(() => ({ configurado: false }));
    if (!correo.configurado) { ui.error('El envío de correo no está configurado para esta sucursal (correo + contraseña de aplicación en el formulario de la sucursal, o SMTP global).'); return; }
    if (!resumen.cliente.email) { ui.error('El cliente no tiene email cargado.'); return; }
    const hoy = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const haceUnMes = new Date(); haceUnMes.setDate(1);
    const v = await formModal({
      title: 'Enviar estado de cuenta', submitText: 'Enviar',
      fields: [
        { name: 'desde', label: 'Desde', type: 'date', value: iso(haceUnMes), required: true, colClass: 'col-md-6' },
        { name: 'hasta', label: 'Hasta', type: 'date', value: iso(hoy), required: true, colClass: 'col-md-6' },
      ],
    });
    if (!v) return;
    ui.loading('Enviando...');
    try {
      const r = await api.post('/clientes/quincena/enviar', {
        sucursalId: resumen.cliente.sucursalId, desde: v.desde, hasta: v.hasta, clienteIds: [Number(clienteId)],
      });
      ui.close();
      if (r.enviados.length) ui.success(`Estado de cuenta enviado a ${resumen.cliente.email}.`);
      else if (r.sinEmail.length) ui.error('El cliente no tiene email.');
      else if (r.fallidos.length) ui.error(`No se pudo enviar: ${r.fallidos[0].error}`);
      else ui.info('Sin envío', 'El cliente no tiene facturas ni saldo en el período.');
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  loading.remove();
  const cab = pageHeader('Cuenta corriente', 'Informe y cuenta corriente del cliente.', [
    h('button', { class: 'btn btn-outline-secondary', onClick: () => router.navigate('/admin/clientes') },
      [h('i', { class: 'bi bi-arrow-left me-1' }), 'Volver a clientes']),
  ]);
  content.append(cab, wrap);
  await recargar();
}

function tile(label, value, icon, color) {
  return h('div', { class: 'col-6 col-md-4 col-lg-2' }, [
    h('div', { class: 'sk-card p-3 h-100' }, [
      h('div', { class: 'd-flex align-items-center gap-2 mb-1' }, [
        h('i', { class: `bi ${icon}`, style: { color, fontSize: '1.2rem' } }),
        h('span', { class: 'text-muted small' }, label),
      ]),
      h('div', { class: 'fw-bold' }, value),
    ]),
  ]);
}

function verDetalle(v, c) {
  const filas = (v.detalles || []).map((d) =>
    `<tr><td class="text-start">${esc(d.nombre)}</td><td class="text-center">${esc(d.cantidad)}</td>
     <td class="text-end">${esc(fmt.money(d.precioUnitario))}</td><td class="text-end">${esc(fmt.money(d.subtotal))}</td></tr>`).join('');
  Swal.fire({
    title: `Factura #${v.id}`,
    html: `
      <div class="text-start small mb-2">
        <div><b>Fecha:</b> ${esc(fmt.dateTime(v.fechaHora))}</div>
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

/** Boleta de una venta en PDF (jsPDF + autotable). */
function boletaPDF(v, c) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text('Facturafy - Boleta', 14, 18);
  doc.setFontSize(10);
  doc.text(`Factura #${v.id}`, 14, 28);
  doc.text(`Fecha: ${fmt.dateTime(v.fechaHora)}`, 14, 34);
  const quien = `${c.razonSocial || c.nombreFantasia || 'Cliente'}${c.rut ? ' (' + (c.tipoDocumento || 'RUT') + ' ' + c.rut + ')' : ''}`;
  doc.text(`Cliente: ${quien}`, 14, 40);
  doc.text(`Forma de pago: ${v.formaPago === 'CREDITO' ? 'Crédito' : 'Contado'}`, 14, 46);
  doc.autoTable({
    startY: 52,
    head: [['Código', 'Producto', 'Cant.', 'Precio', 'Subtotal']],
    body: (v.detalles || []).map((d) => [d.codigoProducto || '', d.nombre || '', d.cantidad, fmt.money(d.precioUnitario), fmt.money(d.subtotal)]),
    styles: { fontSize: 9 }, headStyles: { fillColor: [37, 99, 235] },
  });
  const y = (doc.lastAutoTable?.finalY || 60) + 10;
  doc.setFontSize(12); doc.text(`TOTAL: ${fmt.money(v.total)}`, 14, y);
  if (v.estado === 'ANULADA') { doc.setTextColor(220, 38, 38); doc.text('ANULADA', 150, y); doc.setTextColor(0, 0, 0); }
  doc.save(`boleta-${v.id}.pdf`);
}
