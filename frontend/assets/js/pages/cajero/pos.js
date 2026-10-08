// Punto de venta (POS). Pensado para un lector de codigo de barra FISICO (no camara):
// se pasa el producto por el lector, se pone la cantidad y se factura. Los productos
// iguales se unifican en el carrito. Por defecto la venta es a consumidor final; se
// puede asignar un cliente (por RUT/CI, eligiendolo de la lista o creando uno nuevo).
// Las ventas a credito exigen un cliente registrado. Toda venta se registra dentro
// del turno de caja abierto (sin turno, el POS no opera).
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { router } from '../../core/router.js';
import { pageHeader, spinner } from '../../components/page.js';
import { manualSearch, findByCode } from '../../components/barcode.js';
import { sucursalActiva, sucursalActual } from '../../core/sucursal.js';
import { cargarTurnoActivo, soyMiembro } from '../../core/turno.js';
import { resolveUsuarioId } from '../shared/session.js';
import { onCleanup } from '../../core/lifecycle.js';

const Swal = window.Swal;

export async function posPage() {
  const content = renderShell('Punto de venta');
  const sucursalId = sucursalActiva();
  const loading = spinner('Cargando punto de venta...');
  content.append(loading);

  const productosById = new Map();
  let usuarioId = null;
  let turno = null;
  try {
    let productos;
    [usuarioId, turno, productos] = await Promise.all([
      resolveUsuarioId(),
      cargarTurnoActivo(sucursalId),
      api.get(`/productos/sucursal/${sucursalId}/activos`),
    ]);
    for (const p of productos) productosById.set(p.id, p);
  } catch (err) {
    loading.remove();
    content.append(h('div', { class: 'alert alert-danger' }, `No se pudo cargar el punto de venta: ${err.message}`));
    return;
  }
  loading.remove();

  // Gate de turno: sin turno abierto del que el cajero sea parte, no se puede facturar.
  if (!turno || !soyMiembro(turno, usuarioId)) {
    ui.info('Turno no iniciado', 'Tenés que iniciar o unirte a un turno de caja antes de facturar.');
    router.navigate('/facturacion/dashboard');
    return;
  }

  // Estado del POS.
  const carrito = new Map(); // productoId -> { producto, cantidad }
  let cliente = null;        // null = consumidor final
  let formaPago = 'CONTADO';
  let moneda = 'UYU';        // moneda de cobro
  let cotizacion = 1;        // UYU por 1 unidad de `moneda`
  const empresaId = sucursalActual()?.empresaId;

  content.append(pageHeader('Punto de venta', `Turno ${turno.numeroLabel} · pasá un producto por el lector o buscalo.`, [
    h('button', { class: 'btn btn-outline-secondary', onClick: () => abrirConversor(empresaId) },
      [h('i', { class: 'bi bi-currency-exchange me-1' }), 'Conversor']),
  ]));

  // ---- Boton de alta (solo busqueda manual: el escaneo con camara se quito, se usa
  //      el lector fisico que ya funciona via el listener de teclado de abajo) ----
  const manualBtn = h('button', { class: 'btn btn-primary btn-lg w-100 py-3 d-flex align-items-center justify-content-center gap-2' },
    [h('i', { class: 'bi bi-search', style: { fontSize: '1.3rem' } }), 'Buscar producto']);
  manualBtn.addEventListener('click', async () => {
    const producto = await manualSearch([...productosById.values()]);
    if (!producto) return;
    await agregarAlCarrito(producto);
  });

  const addCard = h('div', { class: 'sk-card p-3 mb-3' }, [
    manualBtn,
    h('div', { class: 'text-muted small mt-2 text-center' }, [
      h('i', { class: 'bi bi-upc-scan me-1' }), 'Pasá el producto por el lector para agregarlo al instante.',
    ]),
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
  const cotizInfo = h('div', { class: 'text-muted small mb-2 d-none' });
  const pagoSelect = h('select', { class: 'form-select w-auto' }, [
    h('option', { value: 'CONTADO', selected: true }, 'Contado'),
    h('option', { value: 'CREDITO' }, 'Crédito'),
  ]);
  const monedaSelect = h('select', { class: 'form-select w-auto' }, [
    h('option', { value: 'UYU', selected: true }, 'Pesos (UYU)'),
    h('option', { value: 'USD' }, 'Dólares (USD)'),
    h('option', { value: 'ARS' }, 'Pesos arg. (ARS)'),
    h('option', { value: 'EUR' }, 'Euros (EUR)'),
  ]);
  const pagaConInput = h('input', { class: 'form-control w-auto', type: 'number', min: 0, step: '0.01', placeholder: '0.00' });
  const vueltoEl = h('span', { class: 'fw-semibold' }, fmt.money(0));
  const pagaConRow = h('div', { class: 'd-flex align-items-center justify-content-between gap-2 mb-1' }, [
    h('label', { class: 'text-muted' }, 'Paga con'), pagaConInput,
  ]);
  const vueltoRow = h('div', { class: 'd-flex align-items-center justify-content-between mb-3' }, [
    h('span', {}, 'Vuelto'), vueltoEl,
  ]);
  const comentarioInput = h('textarea', { class: 'form-control', rows: 2, placeholder: 'Comentario (opcional, sale en la boleta)' });

  pagoSelect.addEventListener('change', (e) => {
    formaPago = e.target.value;
    // El crédito se registra siempre en pesos (la deuda es en UYU).
    if (formaPago === 'CREDITO') { monedaSelect.value = 'UYU'; onMonedaChange('UYU'); }
    monedaSelect.disabled = formaPago === 'CREDITO';
    actualizarVistaPago();
  });
  monedaSelect.addEventListener('change', (e) => onMonedaChange(e.target.value));
  pagaConInput.addEventListener('input', actualizarTotales);

  const facturarBtn = h('button', { class: 'btn btn-success btn-lg w-100 py-3 d-flex align-items-center justify-content-center gap-2' },
    [h('i', { class: 'bi bi-receipt', style: { fontSize: '1.3rem' } }), 'Facturar']);
  facturarBtn.addEventListener('click', facturar);

  const totalesCard = h('div', { class: 'sk-card p-3' }, [
    h('div', { class: 'd-flex justify-content-between mb-1' }, [h('span', { class: 'text-muted' }, 'Subtotal'), subtotalEl]),
    h('div', { class: 'd-flex justify-content-between align-items-center mb-1' }, [h('span', {}, 'Total'), totalEl]),
    cotizInfo,
    h('div', { class: 'd-flex align-items-center justify-content-between gap-2 mb-2' }, [
      h('label', { class: 'text-muted' }, 'Forma de pago'), pagoSelect,
    ]),
    h('div', { class: 'd-flex align-items-center justify-content-between gap-2 mb-2' }, [
      h('label', { class: 'text-muted' }, 'Moneda de cobro'), monedaSelect,
    ]),
    pagaConRow,
    vueltoRow,
    h('div', { class: 'mb-3' }, [comentarioInput]),
    facturarBtn,
  ]);

  // Cambia la moneda de cobro: trae la cotización (admin; API si falta) y recalcula.
  async function onMonedaChange(nueva) {
    moneda = nueva;
    if (moneda === 'UYU') { cotizacion = 1; actualizarTotales(); return; }
    try {
      const r = await api.get(`/cotizaciones/venta?empresaId=${empresaId}&moneda=${moneda}`);
      cotizacion = Number(r.cotizacion) || 1;
    } catch (err) {
      ui.error(err.message);
      moneda = 'UYU'; monedaSelect.value = 'UYU'; cotizacion = 1;
    }
    actualizarTotales();
  }

  // Muestra/oculta "paga con" y "vuelto" (solo contado).
  function actualizarVistaPago() {
    const contado = formaPago === 'CONTADO';
    pagaConRow.classList.toggle('d-none', !contado);
    vueltoRow.classList.toggle('d-none', !contado);
  }

  // Cliente arriba a la izquierda y totales arriba a la derecha; abajo, busqueda y carrito.
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
  actualizarVistaPago();

  // Lector de codigo de barra FISICO: funciona como un teclado que "tipea" el codigo
  // muy rapido y termina con Enter. Lo capturamos a nivel documento para que, estando
  // en el POS, pasar un producto por el lector lo busque y abra el modal de cantidad
  // sin tener que apretar antes ningun boton.
  let bufferScan = '';
  let ultimaTecla = 0;
  async function onKeydownScanner(e) {
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
    carrito.set(producto.id, { producto, cantidad });
    if (cantidad > stockDisponible) ui.toast('Ojo: la cantidad supera el stock disponible.', 'warning');
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
        'El carrito está vacío. Pasá un producto por el lector o buscalo.')]));
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
    const total = totalVenta();                                   // UYU
    const totalMoneda = moneda === 'UYU' ? total : round2(total / cotizacion);
    subtotalEl.textContent = fmt.money(total);
    totalEl.textContent = fmtMon(totalMoneda, moneda);
    if (moneda === 'UYU') {
      cotizInfo.classList.add('d-none'); cotizInfo.textContent = '';
    } else {
      cotizInfo.classList.remove('d-none');
      cotizInfo.textContent = `1 ${moneda} = ${fmt.money(cotizacion)} · Total en pesos: ${fmt.money(total)}`;
    }
    const pagaCon = Number(pagaConInput.value);
    vueltoEl.textContent = (formaPago === 'CONTADO' && Number.isFinite(pagaCon) && pagaCon > 0)
      ? fmtMon(Math.max(0, round2(pagaCon - totalMoneda)), moneda)
      : fmtMon(0, moneda);
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
          h('div', { class: 'text-muted small' }, cliente.rut ? `${cliente.tipoDocumento || 'RUT'}: ${cliente.rut}` : 'Sin documento'),
        ]),
        h('button', { class: 'btn btn-sm btn-outline-secondary', onClick: () => { cliente = null; renderCliente(); } },
          [h('i', { class: 'bi bi-x-lg me-1' }), 'Consumidor final']),
      ]);
    } else {
      detalle = h('div', {}, [
        h('div', { class: 'text-muted mb-2' }, 'Consumidor final (sin datos).'),
        h('div', { class: 'd-flex flex-wrap gap-2' }, [
          h('button', { class: 'btn btn-sm btn-outline-primary', onClick: elegirCliente },
            [h('i', { class: 'bi bi-people me-1' }), 'Elegir cliente']),
        ]),
        h('div', { class: 'text-muted small mt-2' }, 'Los clientes nuevos los da de alta el administrador.'),
      ]);
    }
    clienteBox.append(titulo, detalle);
  }

  // Modal con barra de busqueda: filtra la lista de clientes mientras se escribe,
  // asi no queda una lista interminable cuando hay muchos clientes.
  async function elegirCliente() {
    let clientes;
    try { clientes = await api.get(`/clientes/sucursal/${sucursalId}`); }
    catch (err) { ui.error(err.message); return; }
    if (!clientes.length) {
      ui.info('Sin clientes', 'Todavía no hay clientes en esta sucursal. El administrador los da de alta.');
      return;
    }
    const elegido = await pickClienteBuscable(clientes);
    if (elegido) { cliente = elegido; renderCliente(); }
  }

  // -------------------- Facturar --------------------
  async function facturar() {
    if (carrito.size === 0) return;

    // A credito es obligatorio un cliente registrado: si no hay, se ofrece elegirlo.
    if (formaPago === 'CREDITO' && !cliente) {
      const r = await Swal.fire({
        icon: 'info', title: 'Venta a crédito',
        text: 'Una venta a crédito necesita un cliente registrado.',
        showCancelButton: true, confirmButtonText: 'Elegir cliente', cancelButtonText: 'Cancelar',
        confirmButtonColor: '#2563eb', cancelButtonColor: '#64748b',
      });
      if (r.isConfirmed) await elegirCliente();
      if (!cliente) return; // sigue sin cliente: no se puede facturar a credito
    }

    const total = totalVenta();                                       // UYU
    const totalMoneda = moneda === 'UYU' ? total : round2(total / cotizacion);
    const pagaCon = Number(pagaConInput.value);
    // Validación inmediata del efectivo (el backend igual lo revalida).
    if (formaPago === 'CONTADO' && pagaConInput.value !== '' && Number.isFinite(pagaCon) && pagaCon < totalMoneda) {
      ui.error(`El efectivo (${fmtMon(pagaCon, moneda)}) es menor al total (${fmtMon(totalMoneda, moneda)}).`);
      return;
    }
    const quien = cliente ? (cliente.razonSocial || cliente.nombreFantasia) : 'Consumidor final';
    const lineaMoneda = moneda === 'UYU' ? '' : `\nEn ${moneda}: ${fmtMon(totalMoneda, moneda)} (1 ${moneda} = ${fmt.money(cotizacion)})`;
    const ok = await ui.confirm(
      `Total: ${fmt.money(total)}${lineaMoneda}\nCliente: ${quien}\nPago: ${formaPago === 'CREDITO' ? 'Crédito' : 'Contado'}`,
      { title: '¿Confirmar venta?', confirmText: 'Sí, facturar', danger: false });
    if (!ok) return;

    ui.loading('Registrando venta...');
    try {
      const efectivoRecibido = (formaPago === 'CONTADO' && pagaConInput.value !== '' && Number.isFinite(pagaCon) && pagaCon > 0)
        ? pagaCon : null;
      const venta = await api.post('/ventas', {
        sucursalId, turnoId: turno.id, usuarioId, clienteId: cliente?.id ?? null, formaPago,
        monedaPago: moneda, efectivoRecibido, comentario: comentarioInput.value.trim() || null,
        items: [...carrito.values()].map(({ producto, cantidad }) => ({ productoId: producto.id, cantidad })),
      });
      ui.close();
      for (const { producto, cantidad } of carrito.values()) {
        const p = productosById.get(producto.id);
        if (p) p.cantidadStock = Number(p.cantidadStock) - cantidad;
      }
      carrito.clear();
      cliente = null;
      formaPago = 'CONTADO';
      pagoSelect.value = 'CONTADO';
      moneda = 'UYU'; monedaSelect.value = 'UYU'; monedaSelect.disabled = false; cotizacion = 1;
      pagaConInput.value = ''; comentarioInput.value = '';
      actualizarVistaPago();
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

/**
 * Modal de seleccion de cliente con barra de busqueda. Filtra por razon social,
 * nombre fantasia, RUT/CI, telefono o email mientras se escribe. Resuelve el
 * cliente elegido o null.
 */
function pickClienteBuscable(clientes) {
  const fila = (c, i) => `
    <button type="button" class="list-group-item list-group-item-action" data-i="${i}">
      <div class="fw-semibold">${esc(c.razonSocial || c.nombreFantasia || 'Cliente')}</div>
      <small class="text-muted">${esc(c.rut ? (c.tipoDocumento || 'RUT') + ': ' + c.rut : 'Sin documento')}${c.telefono ? ' · ' + esc(c.telefono) : ''}</small>
    </button>`;
  const coincide = (c, t) => [c.razonSocial, c.nombreFantasia, c.rut, c.telefono, c.email]
    .some((v) => String(v || '').toLowerCase().includes(t));

  return new Promise((resolve) => {
    let elegido = null;
    Swal.fire({
      title: 'Elegí el cliente',
      html: `
        <input id="sk-cli-buscar" class="form-control mb-2" placeholder="Buscar por nombre, RUT/CI, teléfono..." autocomplete="off" />
        <div id="sk-cli-lista" class="list-group text-start" style="max-height:320px;overflow-y:auto"></div>`,
      showConfirmButton: false, showCancelButton: true, cancelButtonText: 'Cancelar', cancelButtonColor: '#64748b',
      didOpen: () => {
        const buscar = document.getElementById('sk-cli-buscar');
        const lista = document.getElementById('sk-cli-lista');
        const pintar = () => {
          const t = buscar.value.trim().toLowerCase();
          const filtrados = t ? clientes.filter((c) => coincide(c, t)) : clientes;
          lista.innerHTML = filtrados.length
            ? filtrados.map((c) => fila(c, clientes.indexOf(c))).join('')
            : '<div class="list-group-item text-muted small">Sin resultados.</div>';
          lista.querySelectorAll('.list-group-item-action').forEach((btn) => {
            btn.addEventListener('click', () => { elegido = clientes[Number(btn.dataset.i)]; Swal.close(); });
          });
        };
        buscar.addEventListener('input', pintar);
        pintar();
        buscar.focus();
      },
      willClose: () => resolve(elegido),
    });
  });
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

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

/** Formatea un monto en una moneda (UYU usa el formateo de pesos; el resto, código + número). */
function fmtMon(n, moneda) {
  if (moneda === 'UYU') return fmt.money(n);
  return `${moneda} ${Number(n || 0).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const NOMBRE_MONEDA = { UYU: 'Pesos (UYU)', USD: 'Dólares (USD)', ARS: 'Pesos arg. (ARS)', EUR: 'Euros (EUR)' };

/**
 * Conversor rápido de monedas. Usa la cotización EN VIVO (API) y, si falla, la del
 * administrador. Las tasas vienen en UYU por 1 unidad de cada moneda.
 */
async function abrirConversor(empresaId) {
  ui.loading('Cargando cotizaciones...');
  let data;
  try { data = await api.get(`/cotizaciones/vivas?empresaId=${empresaId ?? ''}`); }
  catch (err) { ui.close(); ui.error(err.message); return; }
  ui.close();

  const rates = { UYU: 1, ...(data.rates || {}) };          // UYU por 1 unidad
  const monedas = Object.keys(rates);
  if (monedas.length <= 1) { ui.error('No hay cotizaciones disponibles (sin internet ni cotización del admin).'); return; }

  const opt = (sel) => monedas.map((m) => `<option value="${m}"${m === sel ? ' selected' : ''}>${esc(NOMBRE_MONEDA[m] || m)}</option>`).join('');
  const fuente = data.fuente === 'vivo' ? 'cotización en vivo' : 'cotización del administrador';

  Swal.fire({
    title: 'Conversor de monedas',
    html: `
      <div class="text-start">
        <input id="cv-monto" type="number" min="0" step="0.01" class="form-control mb-2" placeholder="Monto" value="1" />
        <div class="d-flex gap-2 align-items-center mb-2">
          <select id="cv-de" class="form-select">${opt('USD')}</select>
          <i class="bi bi-arrow-right"></i>
          <select id="cv-a" class="form-select">${opt('UYU')}</select>
        </div>
        <div id="cv-res" class="fs-5 fw-bold text-center py-2"></div>
        <div class="text-muted small text-center">Fuente: ${esc(fuente)}</div>
      </div>`,
    showConfirmButton: false, showCancelButton: true, cancelButtonText: 'Cerrar', cancelButtonColor: '#64748b',
    didOpen: () => {
      const monto = document.getElementById('cv-monto');
      const de = document.getElementById('cv-de');
      const a = document.getElementById('cv-a');
      const res = document.getElementById('cv-res');
      const calc = () => {
        const m = Number(monto.value);
        if (!Number.isFinite(m)) { res.textContent = '—'; return; }
        const enUyu = m * rates[de.value];            // a pesos
        const out = enUyu / rates[a.value];           // a la moneda destino
        res.textContent = `${fmtMon(m, de.value)} = ${fmtMon(round2(out), a.value)}`;
      };
      [monto, de, a].forEach((el) => el.addEventListener('input', calc));
      calc();
    },
  });
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
    : `${venta.clienteRazonSocial || ''}${venta.clienteRut ? ' (' + (venta.clienteTipoDocumento || 'RUT') + ' ' + venta.clienteRut + ')' : ''}`;
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
  let y = (doc.lastAutoTable?.finalY || 60) + 10;
  doc.setFontSize(12);
  doc.text(`TOTAL: ${fmt.money(venta.total)}`, 14, y);
  doc.setFontSize(10);
  // Cobro en otra moneda + efectivo/vuelto + comentario.
  if (venta.monedaPago && venta.monedaPago !== 'UYU') {
    y += 7; doc.text(`Cobrado en ${venta.monedaPago}: ${fmtMon(venta.totalMoneda, venta.monedaPago)} (1 ${venta.monedaPago} = ${fmt.money(venta.cotizacion)})`, 14, y);
  }
  if (venta.efectivoRecibido != null) {
    y += 6; doc.text(`Paga con: ${fmtMon(venta.efectivoRecibido, venta.monedaPago)}  ·  Vuelto: ${fmtMon(venta.vuelto || 0, venta.monedaPago)}`, 14, y);
  }
  if (venta.comentario) { y += 6; doc.text(`Comentario: ${venta.comentario}`, 14, y); }
  if (venta.cfeEstado && venta.cfeEstado !== 'INTERNO') { y += 6; doc.setFontSize(9); doc.text(`CFE: ${venta.cfeEstado}`, 14, y); }
  doc.save(`venta-${venta.id}.pdf`);
}
