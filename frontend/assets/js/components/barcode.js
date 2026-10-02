// Escaneo de codigos de barra y popups de busqueda/registro de productos.
// - scanBarcode(): abre un modal con camara (html5-qrcode) + input para lector fisico.
// - manualSearch(productos): busca por codigo, codigo de barra o nombre (con seleccion multiple).
// - askCantidad({...}): popup con datos del producto + input de cantidad contada.
import { ui } from '../core/ui.js';
import { h, clear } from '../core/dom.js';

const Swal = window.Swal;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Formatos de codigo de barra 1D mas comunes (si la libreria esta disponible). */
function barcodeFormats() {
  const F = window.Html5QrcodeSupportedFormats;
  if (!F) return undefined;
  return [
    F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E,
    F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR,
  ];
}

/**
 * Abre el modal de escaneo. Resuelve con el codigo leido (string) o null si se cancela.
 * Funciona con la camara del dispositivo y con un lector fisico (que actua como teclado).
 */
export function scanBarcode() {
  return new Promise((resolve) => {
    let scanner = null;
    let settled = false;

    const stopScanner = async () => {
      if (!scanner) return;
      try { await scanner.stop(); scanner.clear(); } catch { /* ignore */ }
      scanner = null;
    };

    const finish = async (code) => {
      if (settled) return;
      settled = true;
      await stopScanner();
      Swal.close();
      resolve(code);
    };

    Swal.fire({
      title: 'Escanear código de barra',
      html: `
        <div id="sk-reader" style="width:100%;min-height:200px"></div>
        <p class="text-muted small mt-2 mb-1">Apuntá la cámara al código de barra,
           o escaneá con un lector (el código aparecerá abajo).</p>
        <input id="sk-scan-input" class="form-control" placeholder="Código..." autocomplete="off" inputmode="none" />
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      cancelButtonColor: '#64748b',
      width: 420,
      didOpen: () => {
        const input = document.getElementById('sk-scan-input');
        if (input) {
          input.focus();
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = input.value.trim();
              if (v) finish(v);
            }
          });
        }
        if (window.Html5Qrcode) {
          try {
            scanner = new Html5Qrcode('sk-reader', { formatsToSupport: barcodeFormats(), verbose: false });
            scanner.start(
              { facingMode: 'environment' },
              { fps: 10, qrbox: { width: 260, height: 130 } },
              (decodedText) => finish(String(decodedText).trim()),
              () => { /* fallo por frame: ignorar */ }
            ).catch(() => {
              const r = document.getElementById('sk-reader');
              if (r) r.innerHTML = '<div class="text-muted small py-4">Cámara no disponible. Usá un lector o escribí el código.</div>';
            });
          } catch {
            /* sin camara: queda el input manual */
          }
        }
      },
      willClose: () => {
        if (!settled) { settled = true; stopScanner(); resolve(null); }
      },
    });
  });
}

/** Popup con la lista de coincidencias para que el usuario elija una. Resuelve producto o null. */
function pickProducto(matches) {
  const html = '<div class="list-group text-start">' + matches.map((p, i) =>
    `<button type="button" class="list-group-item list-group-item-action" data-i="${i}">
       <div class="fw-semibold">${escapeHtml(p.nombre)}</div>
       <small class="text-muted">Cód: ${escapeHtml(p.codigoProducto)}</small>
     </button>`).join('') + '</div>';

  return new Promise((resolve) => {
    let picked = null;
    Swal.fire({
      title: 'Seleccioná el producto',
      html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      cancelButtonColor: '#64748b',
      didOpen: () => {
        document.querySelectorAll('#swal2-html-container .list-group-item-action').forEach((btn) => {
          btn.addEventListener('click', () => { picked = matches[Number(btn.dataset.i)]; Swal.close(); });
        });
      },
      willClose: () => resolve(picked),
    });
  });
}

/**
 * Busqueda manual por codigo / codigo de barra / nombre.
 * Resuelve el producto elegido o null.
 */
export async function manualSearch(productos) {
  const { value: term, isConfirmed } = await Swal.fire({
    title: 'Búsqueda manual',
    input: 'text',
    inputPlaceholder: 'Código, código de barra o nombre',
    showCancelButton: true,
    confirmButtonText: 'Buscar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#2563eb',
    cancelButtonColor: '#64748b',
    inputValidator: (v) => (!v || !v.trim()) ? 'Ingresá algo para buscar.' : undefined,
  });
  if (!isConfirmed) return null;

  const t = term.trim().toLowerCase();

  // 1) Coincidencia exacta por codigo o codigo de barra.
  let matches = productos.filter((p) =>
    (p.codigoProducto || '').toLowerCase() === t ||
    (p.codigosBarra || []).some((b) => (b || '').toLowerCase() === t));

  // 2) Si no hubo exacta, buscar por substring en nombre / codigo / barra.
  if (matches.length === 0) {
    matches = productos.filter((p) =>
      (p.nombre || '').toLowerCase().includes(t) ||
      (p.codigoProducto || '').toLowerCase().includes(t) ||
      (p.codigosBarra || []).some((b) => (b || '').toLowerCase().includes(t)));
  }

  if (matches.length === 0) { ui.error('No se encontró ningún producto con ese criterio.'); return null; }
  if (matches.length === 1) return matches[0];
  return pickProducto(matches);
}

/** Busca un producto por codigo de barra (o codigo). Devuelve producto o null. */
export function findByCode(productos, code) {
  const t = String(code).trim().toLowerCase();
  return productos.find((p) =>
    (p.codigosBarra || []).some((b) => (b || '').toLowerCase() === t) ||
    (p.codigoProducto || '').toLowerCase() === t) || null;
}

/**
 * Popup con los datos del producto + input de cantidad contada.
 * Resuelve el numero ingresado o null si se cancela.
 */
export async function askCantidad({ producto, esperada, nota }) {
  const { value, isConfirmed } = await Swal.fire({
    title: escapeHtml(producto.nombre),
    html: `
      <div class="text-start small mb-2">
        <div><b>Código:</b> ${escapeHtml(producto.codigoProducto)}</div>
        ${(producto.codigosBarra && producto.codigosBarra.length)
          ? `<div><b>Código de barra:</b> ${escapeHtml(producto.codigosBarra.join(', '))}</div>` : ''}
        <div><b>Cantidad esperada:</b> ${escapeHtml(esperada)}</div>
        ${nota ? `<div class="text-warning-emphasis mt-1"><i class="bi bi-exclamation-triangle me-1"></i>${escapeHtml(nota)}</div>` : ''}
      </div>
      <input id="sk-qty" type="number" min="0" class="form-control" placeholder="Cantidad contada" />
    `,
    showCancelButton: true,
    confirmButtonText: 'Registrar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#2563eb',
    cancelButtonColor: '#64748b',
    focusConfirm: false,
    didOpen: () => { const el = document.getElementById('sk-qty'); if (el) el.focus(); },
    preConfirm: () => {
      const v = document.getElementById('sk-qty').value;
      if (v === '' || Number(v) < 0 || Number.isNaN(Number(v))) {
        Swal.showValidationMessage('Ingresá una cantidad válida.');
        return false;
      }
      return Number(v);
    },
  });
  return isConfirmed ? value : null;
}

/**
 * Modal persistente de "conteo guiado": muestra un producto sin contar a la vez,
 * y al registrar avanza automaticamente al siguiente sin cerrarse.
 *
 * @param {object} handlers
 * @param {function(number=):({producto:object,esperada:number}|null)} handlers.obtenerSiguiente
 *        Devuelve el proximo producto sin contar (opcionalmente excluyendo un productoId), o null.
 * @param {function(object,number):Promise} handlers.registrar  Registra (producto, cantidad).
 * @param {function():number} [handlers.restante]  Cantidad de productos sin contar.
 * @returns {{ cerrar:function, notificarContado:function(number,boolean) }}
 */
export function iniciarConteoGuiado({ obtenerSiguiente, registrar, restante, onCerrar }) {
  let cerrado = false;
  let actual = null;      // { producto, esperada }
  let registrando = false;
  const omitidos = new Set(); // ids de producto salteados en esta sesion del modal

  const bodyWrap = h('div', { class: 'p-3' });
  const closeBtn = h('button', {
    class: 'btn-close', 'aria-label': 'Cerrar', onClick: () => cerrar(),
  });
  const restanteEl = h('span', { class: 'text-muted small' });
  const header = h('div', { class: 'd-flex align-items-center justify-content-between px-3 pt-3' }, [
    h('div', { class: 'd-flex align-items-center gap-2' }, [
      h('i', { class: 'bi bi-lightning-charge-fill text-warning' }),
      h('h5', { class: 'mb-0' }, 'Conteo guiado'),
    ]),
    h('div', { class: 'd-flex align-items-center gap-2' }, [restanteEl, closeBtn]),
  ]);

  const card = h('div', {
    style: {
      background: '#fff', borderRadius: '1rem', width: 'min(440px, 94vw)',
      boxShadow: '0 10px 40px rgba(0,0,0,.25)', overflow: 'hidden',
    },
    onClick: (e) => e.stopPropagation(),
  }, [header, bodyWrap]);

  const overlay = h('div', {
    style: {
      position: 'fixed', inset: '0', background: 'rgba(15,23,42,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '2000',
    },
  }, [card]);

  function onKey(e) { if (e.key === 'Escape') cerrar(); }

  function cerrar() {
    if (cerrado) return;
    cerrado = true;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (typeof onCerrar === 'function') onCerrar();
  }

  function actualizarRestante() {
    if (typeof restante === 'function') {
      const n = restante();
      restanteEl.textContent = n > 0 ? `${n} sin contar` : '';
    }
  }

  function renderFin() {
    actual = null;
    clear(bodyWrap);
    bodyWrap.append(
      h('div', { class: 'text-center py-4' }, [
        h('i', { class: 'bi bi-check2-circle text-success', style: { fontSize: '2.5rem' } }),
        h('p', { class: 'mt-2 mb-3' }, '¡No quedan productos sin contar!'),
        h('button', { class: 'btn btn-primary', onClick: () => cerrar() }, 'Cerrar'),
      ])
    );
    actualizarRestante();
  }

  function renderItem(item) {
    actual = item;
    const { producto, esperada } = item;
    clear(bodyWrap);

    const input = h('input', {
      id: 'sk-guiado-qty', type: 'number', min: 0, class: 'form-control form-control-lg text-center',
      placeholder: 'Cantidad contada',
    });
    const regBtn = h('button', { class: 'btn btn-primary btn-lg w-100' },
      [h('i', { class: 'bi bi-check-lg me-1' }), 'Registrar y siguiente']);
    const skipBtn = h('button', { class: 'btn btn-outline-secondary w-100' },
      [h('i', { class: 'bi bi-skip-forward me-1' }), 'No contar, siguiente']);

    async function registrarActual() {
      if (registrando || !actual) return;
      const v = input.value;
      if (v === '' || Number(v) < 0 || Number.isNaN(Number(v))) {
        input.classList.add('is-invalid');
        input.focus();
        return;
      }
      registrando = true; regBtn.disabled = true; skipBtn.disabled = true; closeBtn.disabled = true;
      let ok;
      try {
        ok = await registrar(producto, Number(v));
      } catch (err) {
        registrando = false; regBtn.disabled = false; skipBtn.disabled = false; closeBtn.disabled = false;
        ui.error(err.message);
        return;
      }
      registrando = false; skipBtn.disabled = false; closeBtn.disabled = false;
      if (ok === false) { regBtn.disabled = false; return; } // fallo (ya reportado): no avanzar
      if (cerrado) return;
      cargarSiguiente();
    }

    function omitirActual() {
      if (registrando || !actual) return;
      omitidos.add(Number(producto.id));
      cargarSiguiente();
    }

    input.addEventListener('input', () => input.classList.remove('is-invalid'));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); registrarActual(); } });
    regBtn.addEventListener('click', registrarActual);
    skipBtn.addEventListener('click', omitirActual);

    bodyWrap.append(
      h('h4', { class: 'mb-1' }, producto.nombre),
      h('div', { class: 'text-muted small mb-3' }, `Código: ${producto.codigoProducto}`),
      h('div', { class: 'sk-card p-2 mb-3 text-center bg-light' }, [
        h('div', { class: 'small text-muted' }, 'Cantidad esperada'),
        h('div', { class: 'fs-4 fw-semibold' }, String(esperada)),
      ]),
      input,
      h('div', { class: 'mt-3 d-flex flex-column gap-2' }, [regBtn, skipBtn]),
    );
    actualizarRestante();
    setTimeout(() => input.focus(), 30);
  }

  function cargarSiguiente() {
    let item = obtenerSiguiente(omitidos);
    // Si solo quedan salteados por mí, reciclarlos (probablemente otro ya contó algunos).
    if (!item && omitidos.size > 0) { omitidos.clear(); item = obtenerSiguiente(omitidos); }
    if (!item) { renderFin(); return; }
    renderItem(item);
  }

  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  cargarSiguiente();

  return {
    cerrar,
    /** Aviso externo (tiempo real): si el producto mostrado fue contado por otro, avanza. */
    notificarContado(productoId, contadoPorOtro) {
      if (cerrado) { return; }
      actualizarRestante();
      if (actual && contadoPorOtro && Number(actual.producto.id) === Number(productoId)) {
        ui.toast('Otro participante contó este producto. Pasando al siguiente.', 'info');
        cargarSiguiente();
      }
    },
  };
}
