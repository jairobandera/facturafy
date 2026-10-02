// Punto de venta (POS). Pensado para ser lo mas directo posible: escanear o buscar
// un producto, poner la cantidad, y facturar. Los productos iguales se unifican en
// el carrito. Por defecto la venta es a consumidor final; se puede asignar un cliente
// por RUT. Al facturar se registra la venta y el backend descuenta el stock.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner } from '../../components/page.js';
import { scanBarcode, manualSearch, findByCode } from '../../components/barcode.js';
import { formModal } from '../../components/formModal.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { resolveUsuarioId } from '../shared/session.js';
import { onCleanup } from '../../core/lifecycle.js';

const Swal = window.Swal;

export async function posPage() {
  const content = renderShell('Punto de venta');
  const sucursalId = sucursalActiva();
  const loading = spinner('Cargando productos...');
  content.append(loading);

  const productosById = new Map();
  let usuarioId = null;
  try {
    [usuarioId] = await Promise.all([resolveUsuarioId()]);
    const productos = await api.get(`/productos/sucursal/${sucursalId}/activos`);
    for (const p of productos) productosById.set(p.id, p);
  } catch (err) {
    loading.remove();
    content.append(h('div', { class: 'alert alert-danger' }, `No se pudo cargar el punto de venta: ${err.message}`));
    return;
  }
  loading.remove();

  // Estado del POS.
  const carrito = new Map(); // productoId -> { producto, cantidad }
  let cliente = null;        // null = consumidor final
  let formaPago = 'CONTADO';

  content.append(pageHeader('Punto de venta', 'Escaneá o buscá un producto para agregarlo.'));

  // ---- Botones de alta ----
  const scanBtn = h('button', { class: 'btn btn-primary btn-lg flex-fill py-3 d-flex align-items-center justify-content-center gap-2' },
    [h('i', { class: 'bi bi-upc-scan', style: { fontSize: '1.4rem' } }), 'Escanear producto']);
  scanBtn.addEventListener('click', async () => {
    const code = await scanBarcode();
    if (!code) return;
    const producto = findByCode([...productosById.values()], code);
    if (!producto) { ui.error(`No se encontró ningún producto con el código "${code}".`); return; }
    await agregarAlCarrito(producto);
  });

  const manualBtn = h('button', { class: 'btn btn-outline-secondary btn-lg flex-fill py-3 d-flex align-items-center justify-content-center gap-2' },
    [h('i', { class: 'bi bi-search', style: { fontSize: '1.2rem' } }), 'Búsqueda manual']);
  manualBtn.addEventListener('click', async () => {
    const producto = await manualSearch([...productosById.values()]);
    if (!producto) return;
    await agregarAlCarrito(producto);
  });

  const addCard = h('div', { class: 'sk-card p-3 mb-3' }, [
    h('div', { class: 'd-flex flex-column flex-sm-row gap-2' }, [scanBtn, manualBtn]),
  ]);

  // ---- Carrito ----
  const tbody = h('tbody');
  const cartTable = h('div', { class: 'sk-card p-0 mb-3' }, [
    h('div', { class: 'table-responsive' }, [
      h('table', { class: 'table table-hover align-middle mb-0' }, [
        h('thead', {}, [h('tr', {}, [
          h('th', {}, 'Producto'),
          h('th', { class: 'text-end' }, 'Precio'),
          h('th', { class: 'text-center', style: { width: '130px' } }, 'Cantidad'),
          h('th', { class: 'text-end' }, 'Subtotal'),
          h('th', { class: 'text-end' }, ''),
        ])]),
        tbody,
      ]),
    ]),
  ]);

  // ---- Cliente ----
  const clienteBox = h('div', { class: 'sk-card p-3 mb-3' });

  // ---- Totales + facturar ----
  const subtotalEl = h('span', { class: 'fw-semibold' }, fmt.money(0));
  const totalEl = h('span', { class: 'fs-4 fw-bold' }, fmt.money(0));
  const pagoSelect = h('select', { class: 'form-select w-auto', onChange: (e) => { formaPago = e.target.value; } }, [
    h('option', { value: 'CONTADO', selected: true }, 'Contado'),
    h('option', { value: 'CREDITO' }, 'Crédito'),
  ]);
  const facturarBtn = h('button', { class: 'btn btn-success btn-lg w-100 py-3 d-flex align-items-center justify-content-center gap-2' },
    [h('i', { class: 'bi bi-receipt', style: { fontSize: '1.3rem' } }), 'Facturar']);
  facturarBtn.addEventListener('click', facturar);

  const totalesCard = h('div', { class: 'sk-card p-3' }, [
    h('div', { class: 'd-flex justify-content-between mb-1' }, [h('span', { class: 'text-muted' }, 'Subtotal'), subtotalEl]),
    h('div', { class: 'd-flex justify-content-between align-items-center mb-3' }, [h('span', {}, 'Total'), totalEl]),
    h('div', { class: 'd-flex align-items-center gap-2 mb-3' }, [
      h('label', { class: 'text-muted' }, 'Forma de pago'), pagoSelect,
    ]),
    facturarBtn,
  ]);

  // Cliente arriba a la izquierda y totales arriba a la derecha; abajo, escaneo y carrito.
  content.append(
    h('div', { class: 'row g-3 mb-3' }, [
      h('div', { class: 'col-12 col-lg-6' }, clienteBox),
      h('div', { class: 'col-12 col-lg-6' }, totalesCard),
    ]),
    addCard,
    cartTable,
  );

  renderCarrito();
  renderCliente();

  // Lector de codigo de barra FISICO: funciona como un teclado que "tipea" el codigo
  // muy rapido y termina con Enter. Lo capturamos a nivel documento para que, estando
  // en el POS, pasar un producto por el lector lo busque y abra el modal de cantidad
  // sin tener que apretar antes "Escanear producto".
  let bufferScan = '';
  let ultimaTecla = 0;
  async function onKeydownScanner(e) {
    // Si el foco esta en un campo o hay un popup abierto (cantidad, RUT, busqueda,
    // nuevo cliente, confirmacion), no interceptamos: ese input maneja el escaneo.
    const ae = document.activeElement;
    const enCampo = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable);
    if (enCampo) return;
    if (window.Swal && Swal.isVisible()) return;
    if (document.querySelector('.modal.show')) return;

    const ahora = Date.now();
    if (ahora - ultimaTecla > 120) bufferScan = ''; // tipeo lento => no es el lector
    ultimaTecla = ahora;

    if (e.key === 'Enter') {
      const code = bufferScan.trim();
      bufferScan = '';
      if (code.length >= 3) {
        e.preventDefault();
        const producto = findByCode([...productosById.values()], code);
        if (!producto) { ui.error(`No se encontró ningún producto con el código "${code}".`); return; }
        await agregarAlCarrito(producto);
      }
      return;
    }
    if (e.key.length === 1) bufferScan += e.key;
  }
  document.addEventListener('keydown', onKeydownScanner);
  onCleanup(() => document.removeEventListener('keydown', onKeydownScanner));

  // -------------------- Carrito --------------------
  async function agregarAlCarrito(producto) {
    const existente = carrito.get(producto.id);
    const stockDisponible = Number(producto.cantidadStock);
    const cantidad = await askCantidadVenta(producto, existente?.cantidad);
    if (cantidad == null) return;
    // Unifica productos iguales: reemplaza la cantidad del renglon existente.
    carrito.set(producto.id, { producto, cantidad });
    if (cantidad > stockDisponible) {
      ui.toast('Ojo: la cantidad supera el stock disponible.', 'warning');
    }
    renderCarrito();
  }

  function quitarDelCarrito(productoId) {
    carrito.delete(productoId);
    renderCarrito();
  }

  function renderCarrito() {
    clear(tbody);
    if (carrito.size === 0) {
      tbody.append(h('tr', {}, [h('td', { colspan: 5, class: 'text-center text-muted py-4' },
        'El carrito está vacío. Escaneá o buscá un producto.')]));
    } else {
      for (const { producto, cantidad } of carrito.values()) {
        const sub = Number(producto.precio) * cantidad;
        const input = h('input', {
          class: 'form-control form-control-sm text-center mx-auto', type: 'number', min: 1,
          value: cantidad, style: { maxWidth: '90px' },
        });
        input.addEventListener('change', () => {
          const n = Number(input.value);
          if (!Number.isFinite(n) || n <= 0) { quitarDelCarrito(producto.id); return; }
          carrito.set(producto.id, { producto, cantidad: n });
          renderCarrito();
        });
        tbody.append(h('tr', {}, [
          h('td', {}, [h('div', { class: 'fw-semibold' }, producto.nombre),
            h('div', { class: 'text-muted small' }, `Cód: ${producto.codigoProducto}`)]),
          h('td', { class: 'text-end' }, fmt.money(producto.precio)),
          h('td', { class: 'text-center' }, input),
          h('td', { class: 'text-end' }, fmt.money(sub)),
          h('td', { class: 'text-end' }, [h('button', {
            class: 'btn btn-sm btn-outline-danger', title: 'Quitar', onClick: () => quitarDelCarrito(producto.id),
          }, [h('i', { class: 'bi bi-trash' })])]),
        ]));
      }
    }
    actualizarTotales();
  }

  function totalVenta() {
    let total = 0;
    for (const { producto, cantidad } of carrito.values()) total += Number(producto.precio) * cantidad;
    return total;
  }

  function actualizarTotales() {
    const total = totalVenta();
    subtotalEl.textContent = fmt.money(total);
    totalEl.textContent = fmt.money(total);
    facturarBtn.disabled = carrito.size === 0;
  }

  // -------------------- Cliente --------------------
  function renderCliente() {
    clear(clienteBox);
    const titulo = h('div', { class: 'd-flex align-items-center justify-content-between mb-2' }, [
      h('span', { class: 'fw-semibold' }, [h('i', { class: 'bi bi-person-vcard me-1' }), 'Cliente']),
    ]);
    let detalle;
    if (cliente) {
      detalle = h('div', { class: 'd-flex align-items-center justify-content-between' }, [
        h('div', {}, [
          h('div', { class: 'fw-semibold' }, cliente.razonSocial || cliente.nombreFantasia || 'Cliente'),
          h('div', { class: 'text-muted small' }, cliente.rut ? `RUT: ${cliente.rut}` : 'Sin RUT'),
        ]),
        h('button', { class: 'btn btn-sm btn-outline-secondary', onClick: () => { cliente = null; renderCliente(); } },
          [h('i', { class: 'bi bi-x-lg me-1' }), 'Consumidor final']),
      ]);
    } else {
      detalle = h('div', {}, [
        h('div', { class: 'text-muted mb-2' }, 'Consumidor final (sin datos).'),
        h('div', { class: 'd-flex flex-wrap gap-2' }, [
          h('button', { class: 'btn btn-sm btn-outline-primary', onClick: ingresarPorRut },
            [h('i', { class: 'bi bi-upc me-1' }), 'Ingresar RUT']),
          h('button', { class: 'btn btn-sm btn-outline-secondary', onClick: elegirCliente },
            [h('i', { class: 'bi bi-people me-1' }), 'Elegir cliente']),
          h('button', { class: 'btn btn-sm btn-outline-success', onClick: () => nuevoCliente() },
            [h('i', { class: 'bi bi-person-plus me-1' }), 'Nuevo cliente']),
        ]),
      ]);
    }
    clienteBox.append(titulo, detalle);
  }

  async function ingresarPorRut() {
    const { value: rut, isConfirmed } = await Swal.fire({
      title: 'RUT del cliente', input: 'text', inputPlaceholder: 'Ej: 216000000013',
      showCancelButton: true, confirmButtonText: 'Buscar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb', cancelButtonColor: '#64748b',
      inputValidator: (v) => (!v || !v.trim()) ? 'Ingresá un RUT.' : undefined,
    });
    if (!isConfirmed) return;
    const limpio = rut.trim();
    try {
      cliente = await api.get(`/clientes/sucursal/${sucursalId}/rut/${encodeURIComponent(limpio)}`);
      renderCliente();
    } catch (err) {
      if (err.status === 404) {
        const crear = await ui.confirm(`No existe un cliente con RUT ${limpio}. ¿Querés crearlo?`,
          { confirmText: 'Sí, crear', danger: false });
        if (crear) await nuevoCliente({ rut: limpio });
      } else {
        ui.error(err.message);
      }
    }
  }

  async function elegirCliente() {
    let clientes;
    try { clientes = await api.get(`/clientes/sucursal/${sucursalId}`); }
    catch (err) { ui.error(err.message); return; }
    if (!clientes.length) { ui.info('Sin clientes', 'Todavía no hay clientes cargados en esta sucursal.'); return; }
    const html = '<div class="list-group text-start">' + clientes.map((c, i) =>
      `<button type="button" class="list-group-item list-group-item-action" data-i="${i}">
         <div class="fw-semibold">${esc(c.razonSocial || c.nombreFantasia || 'Cliente')}</div>
         <small class="text-muted">${esc(c.rut ? 'RUT: ' + c.rut : 'Sin RUT')}</small>
       </button>`).join('') + '</div>';
    let elegido = null;
    await Swal.fire({
      title: 'Elegí el cliente', html, showConfirmButton: false, showCancelButton: true,
      cancelButtonText: 'Cancelar', cancelButtonColor: '#64748b',
      didOpen: () => {
        document.querySelectorAll('#swal2-html-container .list-group-item-action').forEach((btn) => {
          btn.addEventListener('click', () => { elegido = clientes[Number(btn.dataset.i)]; Swal.close(); });
        });
      },
    });
    if (elegido) { cliente = elegido; renderCliente(); }
  }

  async function nuevoCliente(prefill = {}) {
    const values = await formModal({
      title: 'Nuevo cliente',
      fields: [
        { name: 'razonSocial', label: 'Razón social', required: true, colClass: 'col-md-6' },
        { name: 'rut', label: 'RUT', value: prefill.rut, colClass: 'col-md-6' },
        { name: 'nombreFantasia', label: 'Nombre fantasía', colClass: 'col-md-6' },
        { name: 'telefono', label: 'Teléfono', colClass: 'col-md-6' },
        { name: 'direccion', label: 'Dirección', colClass: 'col-md-6' },
        { name: 'email', label: 'Email', type: 'email', colClass: 'col-md-6' },
      ],
    });
    if (!values) return;
    try {
      cliente = await api.post('/clientes', {
        razonSocial: values.razonSocial, rut: values.rut || null,
        nombreFantasia: values.nombreFantasia || null, telefono: values.telefono || null,
        direccion: values.direccion || null, email: values.email || null,
        tipoDocumento: 'RUT', sucursalId,
      });
      ui.success('Cliente creado.');
      renderCliente();
    } catch (err) { ui.error(err.message); }
  }

  // -------------------- Facturar --------------------
  async function facturar() {
    if (carrito.size === 0) return;
    const total = totalVenta();
    const quien = cliente ? (cliente.razonSocial || cliente.nombreFantasia) : 'Consumidor final';
    const ok = await ui.confirm(
      `Total: ${fmt.money(total)}\nCliente: ${quien}\nPago: ${formaPago === 'CREDITO' ? 'Crédito' : 'Contado'}`,
      { title: '¿Confirmar venta?', confirmText: 'Sí, facturar', danger: false });
    if (!ok) return;

    ui.loading('Registrando venta...');
    try {
      const venta = await api.post('/ventas', {
        sucursalId, usuarioId, clienteId: cliente?.id ?? null, formaPago,
        items: [...carrito.values()].map(({ producto, cantidad }) => ({ productoId: producto.id, cantidad })),
      });
      ui.close();
      // Refresca el stock local con el que ya descontó el backend.
      for (const { producto, cantidad } of carrito.values()) {
        const p = productosById.get(producto.id);
        if (p) p.cantidadStock = Number(p.cantidadStock) - cantidad;
      }
      carrito.clear();
      cliente = null;
      formaPago = 'CONTADO';
      pagoSelect.value = 'CONTADO';
      renderCarrito();
      renderCliente();
      await ofrecerComprobante(venta);
    } catch (err) {
      ui.close();
      ui.error(err.message || 'No se pudo registrar la venta.');
    }
  }

  async function ofrecerComprobante(venta) {
    const res = await Swal.fire({
      icon: 'success', title: 'Venta registrada',
      html: `Venta #${venta.id} — Total ${esc(fmt.money(venta.total))}`,
      showCancelButton: true, confirmButtonText: 'Descargar comprobante', cancelButtonText: 'Listo',
      confirmButtonColor: '#2563eb', cancelButtonColor: '#64748b',
    });
    if (res.isConfirmed) generarComprobantePDF(venta);
  }
}

/** Popup simple de cantidad a vender (muestra precio y stock disponible). */
function askCantidadVenta(producto, cantidadActual) {
  return new Promise((resolve) => {
    Swal.fire({
      title: esc(producto.nombre),
      html: `
        <div class="text-start small mb-2">
          <div><b>Código:</b> ${esc(producto.codigoProducto)}</div>
          <div><b>Precio:</b> ${esc(fmt.money(producto.precio))}</div>
          <div><b>Stock disponible:</b> ${esc(producto.cantidadStock)}</div>
        </div>
        <input id="sk-venta-qty" type="number" min="1" class="form-control form-control-lg text-center"
               value="${cantidadActual ?? 1}" />`,
      showCancelButton: true, confirmButtonText: 'Agregar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb', cancelButtonColor: '#64748b', focusConfirm: false,
      didOpen: () => { const el = document.getElementById('sk-venta-qty'); if (el) { el.focus(); el.select(); } },
      preConfirm: () => {
        const v = Number(document.getElementById('sk-venta-qty').value);
        if (!Number.isFinite(v) || v <= 0) { Swal.showValidationMessage('Ingresá una cantidad válida.'); return false; }
        return v;
      },
    }).then((r) => resolve(r.isConfirmed ? r.value : null));
  });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Comprobante interno en PDF (jsPDF + autotable, ya cargados por CDN). */
function generarComprobantePDF(venta) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text('Facturafy - Comprobante de venta', 14, 18);
  doc.setFontSize(10);
  doc.text(`Venta #${venta.id}`, 14, 28);
  doc.text(`Fecha: ${fmt.dateTime(venta.fechaHora)}`, 14, 34);
  const quien = venta.consumidorFinal ? 'Consumidor final'
    : `${venta.clienteRazonSocial || ''}${venta.clienteRut ? ' (RUT ' + venta.clienteRut + ')' : ''}`;
  doc.text(`Cliente: ${quien}`, 14, 40);
  doc.text(`Forma de pago: ${venta.formaPago === 'CREDITO' ? 'Crédito' : 'Contado'}`, 14, 46);

  doc.autoTable({
    startY: 52,
    head: [['Código', 'Producto', 'Cant.', 'Precio', 'Subtotal']],
    body: (venta.detalles || []).map((d) => [
      d.codigoProducto || '', d.nombre || '', d.cantidad,
      fmt.money(d.precioUnitario), fmt.money(d.subtotal),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  const y = (doc.lastAutoTable?.finalY || 60) + 10;
  doc.setFontSize(12);
  doc.text(`TOTAL: ${fmt.money(venta.total)}`, 14, y);
  if (venta.cfeEstado && venta.cfeEstado !== 'INTERNO') {
    doc.setFontSize(9);
    doc.text(`CFE: ${venta.cfeEstado}`, 14, y + 8);
  }
  doc.save(`venta-${venta.id}.pdf`);
}
