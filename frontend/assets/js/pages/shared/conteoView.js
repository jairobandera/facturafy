// Vista de conteo colaborativo en tiempo real (usada por admin y empleado).
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { ws } from '../../core/ws.js';
import { ui, fmt } from '../../core/ui.js';
import { router } from '../../core/router.js';
import { renderShell } from '../../core/layout.js';
import { onCleanup } from '../../core/lifecycle.js';
import { spinner, badge } from '../../components/page.js';
import { scanBarcode, manualSearch, findByCode, askCantidad, iniciarConteoGuiado } from '../../components/barcode.js';
import { resolveUsuarioId, resolvePerfil } from './session.js';
import { sucursalesDeMiEmpresa, nombreSucursal, esMiSucursal } from '../../core/sucursal.js';

export async function conteoView({ conteoId, backHref }) {
  conteoId = Number(conteoId);
  const content = renderShell(`Conteo #${conteoId}`);
  const loading = spinner('Cargando conteo...');
  content.append(loading);

  const isAdmin = auth.getRole() === 'ADMINISTRADOR';
  // La sucursal sale del CONTEO, no del token: un conteo puede ser de otra sucursal
  // y el catalogo, el escaneo y el conteo guiado tienen que ser los de esa sucursal.
  let sucursalId = auth.getSucursalId();
  const productosById = new Map();    // productoId -> producto
  const rowsById = new Map();         // conteoProductoId -> dato
  const rowByProducto = new Map();    // productoId -> conteoProductoId
  const participantsById = new Map(); // usuarioId -> nombre a mostrar
  let myUsuarioId = null;
  let guiadoRef = null; // controlador del modal de conteo guiado (si esta abierto)

  let conteo;
  try {
    myUsuarioId = await resolveUsuarioId();
    const usuarioId = myUsuarioId;
    conteo = await api.get(`/conteos/${conteoId}`);
    if (!conteo) { showError('Conteo no encontrado.'); return; }
    if (conteo.conteoFinalizado || conteo.activo === false) {
      showError('Este conteo ya fue finalizado.');
      return;
    }
    if (conteo.sucursalId) {
      sucursalId = conteo.sucursalId;
      if (!(await puedeAccederA(sucursalId))) {
        showError('Este conteo es de otra sucursal y no tenés acceso.');
        return;
      }
    }
    // Registrarse como participante (ignorar si ya estaba)
    try { await api.post(`/conteo-usuarios/conteo/${conteoId}/usuario/${usuarioId}`); } catch { /* ya registrado */ }

    const [productos, conteoProductos] = await Promise.all([
      api.get(`/productos/sucursal/${sucursalId}/activos`),
      api.get(`/conteoproducto/conteo-productos/${conteoId}`),
    ]);
    for (const p of productos) productosById.set(p.id, p);
    for (const cp of conteoProductos) registerRow(cp);
  } catch (err) {
    showError(err.message);
    return;
  }

  loading.remove();
  buildUI();

  function registerRow(cp) {
    rowsById.set(cp.id, cp);
    if (cp.productoId != null) rowByProducto.set(cp.productoId, cp.id);
  }

  function nombreDe(usuarioId) {
    if (usuarioId == null) return 'otro participante';
    return participantsById.get(Number(usuarioId)) || 'otro participante';
  }

  /**
   * Si el renglon ya fue contado por OTRO usuario, pide confirmacion.
   * Devuelve true si se puede (re)contar, false si se debe dejar como esta.
   */
  async function confirmRecount(cp) {
    if (!cp || cp.cantidadContada == null) return true;
    if (Number(cp.usuarioId) === Number(myUsuarioId)) return true; // yo mismo: sin alerta
    const producto = productosById.get(cp.productoId);
    const nombre = producto ? producto.nombre : `Producto #${cp.productoId}`;
    return ui.confirm(
      `"${nombre}" ya fue contado por ${nombreDe(cp.usuarioId)}: ${cp.cantidadContada} unidades.\n\n¿Querés volver a contarlo?`,
      { confirmText: 'Sí, contar de nuevo', cancelText: 'No, dejar así', danger: false }
    );
  }

  /**
   * Mismas reglas que el backend (usuario/acceso.js): la sucursal propia siempre;
   * fuera de ella, el admin llega a toda su empresa y el empleado solo si tiene
   * habilitado "cuenta en cualquier sucursal".
   */
  async function puedeAccederA(sucId) {
    if (esMiSucursal(sucId)) return true;
    if (!isAdmin) {
      const perfil = await resolvePerfil();
      if (!perfil.cuentaEnCualquierSucursal) return false;
    }
    const deMiEmpresa = await sucursalesDeMiEmpresa();
    return deMiEmpresa.some((s) => Number(s.id) === Number(sucId));
  }

  function showError(msg) {
    loading.remove();
    content.append(h('div', { class: 'sk-card p-5 text-center' }, [
      h('i', { class: 'bi bi-exclamation-triangle text-warning', style: { fontSize: '2.5rem' } }),
      h('p', { class: 'mt-3 mb-3' }, msg),
      h('button', { class: 'btn btn-primary', onClick: () => router.navigate(backHref) }, 'Volver'),
    ]));
  }

  function buildUI() {
    const tipoLabel = conteo.tipoConteo === 'CATEGORIAS' ? 'Por categorías' : 'Libre';
    const tbody = h('tbody');

    const header = h('div', { class: 'd-flex flex-wrap justify-content-between align-items-center mb-3 gap-2' }, [
      h('div', {}, [
        h('button', { class: 'btn btn-sm btn-outline-secondary mb-2', onClick: () => router.navigate(backHref) },
          [h('i', { class: 'bi bi-arrow-left me-1' }), 'Volver']),
        h('h4', { class: 'mb-0' }, [
          `Conteo #${conteoId} `,
          badge(tipoLabel, conteo.tipoConteo === 'CATEGORIAS' ? 'info' : 'primary'),
          // Se avisa cuando el conteo no es de la sucursal propia.
          conteo.sucursalId && !esMiSucursal(conteo.sucursalId)
            ? h('span', { class: 'badge text-bg-warning ms-1' },
              [h('i', { class: 'bi bi-shop me-1' }), nombreSucursal(conteo.sucursalId)])
            : null,
        ]),
        h('div', { class: 'text-muted small' }, `Iniciado: ${fmt.dateTime(conteo.fechaHora)}`),
      ]),
      h('div', { class: 'd-flex align-items-center gap-3' }, [
        h('span', { class: 'sk-conteo-live d-flex align-items-center gap-2 text-muted' },
          [h('span', { class: 'sk-dot on', id: 'ws-dot' }), 'En vivo']),
        isAdmin ? h('button', { class: 'btn btn-success', onClick: finalizar },
          [h('i', { class: 'bi bi-check2-circle me-1' }), 'Finalizar conteo']) : null,
      ]),
    ]);

    const participantsBox = h('div', { class: 'sk-card p-3 mb-3' }, [
      h('div', { class: 'small text-muted mb-1' }, 'Participantes'),
      h('div', { id: 'sk-participants', class: 'd-flex flex-wrap gap-2' }, 'Cargando...'),
    ]);

    // Escaneo / busqueda: disponible para ambos tipos de conteo.
    const addCard = buildAddCard();

    const table = h('div', { class: 'sk-card p-0' }, [
      h('div', { class: 'table-responsive' }, [
        h('table', { class: 'table table-hover align-middle mb-0' }, [
          h('thead', {}, [h('tr', {}, [
            h('th', {}, 'Producto'),
            h('th', { class: 'text-center' }, 'Esperado'),
            h('th', { class: 'text-center' }, 'Contado'),
            h('th', { class: 'text-center' }, 'Diferencia'),
          ])]),
          tbody,
        ]),
      ]),
    ]);

    content.append(header, participantsBox, addCard, table);

    window.__conteoTbody = tbody;
    renderRows(tbody);
    loadParticipants();

    // Tiempo real
    const unsub1 = ws.subscribe('conteo-producto-actualizado', (payload) => {
      if (!payload || payload.conteoId !== conteoId) return;
      registerRow(payload);
      renderRows(tbody);
      // Avisar al conteo guiado: si otro participante contó el item mostrado, avanzar.
      if (guiadoRef) {
        const contadoPorOtro = payload.cantidadContada != null && Number(payload.usuarioId) !== Number(myUsuarioId);
        guiadoRef.notificarContado(payload.productoId, contadoPorOtro);
      }
    });
    const unsub2 = ws.subscribe('conteo-finalizado', (payload) => {
      if (payload && Number(payload.id) === conteoId) {
        if (guiadoRef) guiadoRef.cerrar();
        ui.info('Conteo finalizado', 'El conteo fue finalizado.');
        router.navigate(backHref);
      }
    });
    const partTimer = setInterval(loadParticipants, 5000);
    const dotTimer = setInterval(() => {
      const d = document.getElementById('ws-dot');
      if (d) d.className = 'sk-dot ' + (ws.isConnected() ? 'on' : 'off');
    }, 1500);
    onCleanup(() => { unsub1(); unsub2(); clearInterval(partTimer); clearInterval(dotTimer); if (guiadoRef) guiadoRef.cerrar(); });
  }

  function esCategorias() { return conteo.tipoConteo === 'CATEGORIAS'; }

  // Productos sobre los que se puede buscar/scanear.
  // CATEGORIAS: solo los que ya forman parte del conteo. LIBRE: todos los activos.
  function searchPool() {
    if (esCategorias()) {
      return [...rowByProducto.keys()].map((pid) => productosById.get(pid)).filter(Boolean);
    }
    return [...productosById.values()];
  }

  // Valida pertenencia (para CATEGORIAS) y abre el popup de registro.
  async function procesarProducto(producto, etiqueta) {
    if (!producto) { ui.error(`No se encontró ningún producto con "${etiqueta}".`); return; }
    if (esCategorias() && !rowByProducto.has(producto.id)) {
      ui.error(`"${producto.nombre}" no forma parte de este conteo por categorías.`);
      return;
    }
    await abrirRegistro(producto);
  }

  // Renglones sin contar (para CATEGORIAS): parte del conteo, con producto conocido y sin cantidad.
  function renglonesSinContar(excludeProductoId) {
    return [...rowsById.values()].filter((cp) =>
      cp.cantidadContada == null &&
      cp.productoId != null &&
      productosById.has(cp.productoId) &&
      Number(cp.productoId) !== Number(excludeProductoId));
  }

  // Elige un producto sin contar (aleatorio, para repartir entre usuarios y evitar choques).
  // `excluir` puede ser un id único o un Set/array de ids a excluir (productos salteados).
  function proximoSinContar(excluir) {
    const excl = excluir instanceof Set
      ? excluir
      : new Set((Array.isArray(excluir) ? excluir : (excluir != null ? [excluir] : [])).map(Number));
    const candidatos = [...rowsById.values()].filter((cp) =>
      cp.cantidadContada == null && cp.productoId != null &&
      productosById.has(cp.productoId) && !excl.has(Number(cp.productoId)));
    if (candidatos.length === 0) return null;
    const cp = candidatos[Math.floor(Math.random() * candidatos.length)];
    const producto = productosById.get(cp.productoId);
    const esperada = cp.cantidadEsperada ?? Number(producto.cantidadStock) ?? 0;
    return { producto, esperada };
  }

  function buildAddCard() {
    const scanBtn = h('button', { class: 'btn btn-primary btn-lg flex-fill py-3 d-flex align-items-center justify-content-center gap-2' },
      [h('i', { class: 'bi bi-upc-scan', style: { fontSize: '1.4rem' } }), 'Escanear código de barra']);
    scanBtn.addEventListener('click', async () => {
      const code = await scanBarcode();
      if (!code) return;
      // El escaneo identifica sobre TODOS los productos; procesarProducto valida pertenencia.
      await procesarProducto(findByCode([...productosById.values()], code), code);
    });

    const manualBtn = h('button', { class: 'btn btn-outline-secondary btn-lg flex-fill py-3 d-flex align-items-center justify-content-center gap-2' },
      [h('i', { class: 'bi bi-search', style: { fontSize: '1.2rem' } }), 'Búsqueda manual']);
    manualBtn.addEventListener('click', async () => {
      const producto = await manualSearch(searchPool());
      if (!producto) return;
      await abrirRegistro(producto);
    });

    const botones = [h('div', { class: 'd-flex flex-column flex-sm-row gap-2' }, [scanBtn, manualBtn])];

    // Conteo guiado: solo para CATEGORIAS (hay un conjunto conocido de productos esperados).
    if (esCategorias()) {
      const guiadoBtn = h('button', { class: 'btn btn-warning btn-lg w-100 py-3 d-flex align-items-center justify-content-center gap-2' },
        [h('i', { class: 'bi bi-lightning-charge-fill', style: { fontSize: '1.3rem' } }), 'Conteo guiado']);
      guiadoBtn.addEventListener('click', () => {
        if (guiadoRef) return; // ya abierto
        if (renglonesSinContar().length === 0) {
          ui.info('Conteo guiado', 'No quedan productos sin contar.');
          return;
        }
        guiadoRef = iniciarConteoGuiado({
          obtenerSiguiente: (excluir) => proximoSinContar(excluir),
          registrar: (producto, cantidad) => registrarConteo(producto, cantidad),
          restante: () => renglonesSinContar().length,
          onCerrar: () => { guiadoRef = null; },
        });
      });
      botones.push(guiadoBtn);
    }

    return h('div', { class: 'sk-card p-3 mb-3' }, [
      h('div', { class: 'd-flex flex-column gap-2' }, botones),
    ]);
  }

  // Abre el popup de registro para un producto ya identificado.
  async function abrirRegistro(producto) {
    const existingId = rowByProducto.get(producto.id);
    const cp = existingId ? rowsById.get(existingId) : null;
    const esperada = cp?.cantidadEsperada ?? Number(producto.cantidadStock) ?? 0;

    let nota = null;
    if (cp && cp.cantidadContada != null) {
      nota = Number(cp.usuarioId) === Number(myUsuarioId)
        ? `Ya lo contaste: ${cp.cantidadContada} unidades. Volver a registrar lo reemplaza.`
        : `Ya fue contado por ${nombreDe(cp.usuarioId)}: ${cp.cantidadContada} unidades. Volver a registrar lo reemplaza.`;
    }

    const cantidad = await askCantidad({ producto, esperada, nota });
    if (cantidad == null) return; // canceló
    await registrarConteo(producto, cantidad);
  }

  async function registrarConteo(producto, cantidad) {
    const existingId = rowByProducto.get(producto.id);
    try {
      if (existingId) {
        const updated = await api.put(`/conteoproducto/${existingId}`, { cantidadContada: cantidad, usuarioId: myUsuarioId });
        registerRow(updated);
      } else {
        const created = await api.post('/conteoproducto', {
          conteoId, productoId: producto.id, precioActual: producto.precio,
          cantidadEsperada: Number(producto.cantidadStock), cantidadContada: cantidad,
          usuarioId: myUsuarioId,
        });
        registerRow(created);
      }
      renderRows(window.__conteoTbody);
      ui.success('Registrado.');
      return true;
    } catch (err) { ui.error(err.message); return false; }
  }

  function renderRows(tbody) {
    clear(tbody);
    const list = [...rowsById.values()].sort((a, b) => a.id - b.id);
    if (list.length === 0) {
      tbody.append(h('tr', {}, [h('td', { colspan: 4, class: 'text-center text-muted py-4' },
        conteo.tipoConteo === 'LIBRE' ? 'Aún no registraste productos.' : 'Sin productos en el conteo.')]));
      return;
    }
    for (const cp of list) tbody.append(rowEl(cp));
  }

  function rowEl(cp) {
    const producto = productosById.get(cp.productoId);
    const nombre = producto ? `${producto.nombre}` : `Producto #${cp.productoId}`;
    const esperada = cp.cantidadEsperada ?? 0;
    const contada = cp.cantidadContada;
    const diff = contada == null ? null : contada - esperada;

    const input = h('input', {
      class: 'form-control form-control-sm sk-count-input mx-auto', type: 'number', min: 0,
      value: contada ?? '',
    });
    input.addEventListener('change', async () => {
      if (input.value === '') return;
      if (!(await confirmRecount(cp))) { input.value = cp.cantidadContada ?? ''; return; }
      try {
        const updated = await api.put(`/conteoproducto/${cp.id}`, { cantidadContada: Number(input.value), usuarioId: myUsuarioId });
        registerRow(updated);
        renderRows(window.__conteoTbody);
      } catch (err) { ui.error(err.message); }
    });

    let diffCell, rowCls = '';
    if (diff === null) diffCell = h('span', { class: 'text-muted' }, '—');
    else if (diff < 0) { diffCell = h('span', { class: 'text-danger fw-semibold' }, String(diff)); rowCls = 'sk-diff-faltante'; }
    else if (diff > 0) { diffCell = h('span', { class: 'text-primary fw-semibold' }, `+${diff}`); rowCls = 'sk-diff-sobrante'; }
    else { diffCell = h('span', { class: 'text-success fw-semibold' }, '0'); rowCls = 'sk-diff-ok'; }

    return h('tr', { class: rowCls }, [
      h('td', {}, nombre),
      h('td', { class: 'text-center' }, String(esperada)),
      h('td', { class: 'text-center' }, input),
      h('td', { class: 'text-center' }, diffCell),
    ]);
  }

  async function loadParticipants() {
    try {
      const usuarios = await api.get(`/conteo-usuarios/por-conteo/${conteoId}`);
      const box = document.getElementById('sk-participants');
      if (!box) return;
      clear(box);
      if (usuarios.length === 0) { box.append(h('span', { class: 'text-muted small' }, 'Sin participantes aún.')); return; }
      for (const u of usuarios) {
        const display = `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.nombreUsuario;
        participantsById.set(Number(u.id), display);
        box.append(h('span', { class: 'badge text-bg-light border' },
          [h('i', { class: 'bi bi-person-circle me-1' }), display]));
      }
    } catch { /* silencioso */ }
  }

  async function finalizar() {
    const ok = await ui.confirm('¿Finalizar el conteo? No podrá seguir editándose.', { confirmText: 'Sí, finalizar', danger: false });
    if (!ok) return;
    ui.loading('Finalizando...');
    try {
      await api.put(`/conteos/${conteoId}`, { conteoFinalizado: true });
      ui.close();
      ui.success('Conteo finalizado.');
      router.navigate(backHref);
    } catch (err) { ui.close(); ui.error(err.message); }
  }
}
