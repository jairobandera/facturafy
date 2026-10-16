// Promociones (administrador): precio especial para una lista de productos, por sucursal,
// con vigencia (desde/hasta; sin "hasta" = hasta que el admin la dé de baja). Solo paquete
// completo. Mientras está vigente, esos productos se cobran al precio de la promo en el POS.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, badge, primaryButton } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { sucursalSelect } from '../../components/sucursalSelect.js';

const Swal = window.Swal;

const ESTADO_BADGE = {
  VIGENTE: ['Vigente', 'success'],
  PROGRAMADA: ['Programada', 'info'],
  VENCIDA: ['Vencida', 'secondary'],
};

function vigenciaTexto(p) {
  const d = p.fechaDesde ? fmt.date(p.fechaDesde) : null;
  const hh = p.fechaHasta ? fmt.date(p.fechaHasta) : null;
  if (d && hh) return `${d} → ${hh}`;
  if (!d && hh) return `hasta ${hh}`;
  if (d && !hh) return `desde ${d} (sin fin)`;
  return 'Sin fecha (hasta baja manual)';
}

export function promocionesPage() {
  const content = renderShell('Promociones');
  content.append(pageHeader('Promociones', 'Precio especial para una lista de productos, por sucursal.'));

  content.append(h('div', { class: 'sk-card p-3 mb-3' }, [
    sucursalSelect(() => load()),
    h('div', { class: 'd-flex flex-wrap gap-2 mt-2' }, [
      primaryButton('Nueva promoción', 'bi-plus-lg', () => abrir()),
    ]),
  ]));

  const tableWrap = h('div');
  content.append(tableWrap);

  async function abrir(promo) {
    const sucursalId = sucursalActiva();
    let productos;
    try { productos = await api.get(`/productos/sucursal/${sucursalId}/activos`); }
    catch (err) { ui.error(err.message); return; }
    const datos = await promoModal({ productos, promo });
    if (!datos) return;
    ui.loading('Guardando...');
    try {
      if (promo) await api.put(`/promociones/${promo.id}`, datos);
      else await api.post('/promociones', { sucursalId, ...datos });
      ui.close();
      ui.success('Promoción guardada.');
      await load();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function darDeBaja(p) {
    const ok = await ui.confirm(`¿Dar de baja la promoción "${p.nombre}"? Dejará de aplicarse en el POS.`, { confirmText: 'Dar de baja' });
    if (!ok) return;
    ui.loading('Dando de baja...');
    try { await api.del(`/promociones/${p.id}`); ui.close(); await load(); }
    catch (err) { ui.close(); ui.error(err.message); }
  }

  async function load() {
    clear(tableWrap);
    const sp = spinner('Cargando promociones...');
    tableWrap.append(sp);
    try {
      const rows = await api.get(`/promociones/sucursal/${sucursalActiva()}`);
      clear(tableWrap);
      if (!rows.length) {
        tableWrap.append(h('div', { class: 'sk-card p-4 text-center text-muted' },
          'Todavía no hay promociones. Creá una con "Nueva promoción".'));
        return;
      }
      tableWrap.append(dataTable({
        columns: [
          { key: 'nombre', label: 'Promoción' },
          { key: 'precio', label: 'Precio', className: 'text-end', render: (r) => fmt.money(r.precio) },
          { key: 'productos', label: 'Productos', className: 'text-center', render: (r) => String(r.productos.length) },
          { key: 'vigencia', label: 'Vigencia', render: (r) => vigenciaTexto(r) },
          { key: 'estado', label: 'Estado', render: (r) => { const [t, c] = ESTADO_BADGE[r.estado] || [r.estado, 'secondary']; return badge(t, c); } },
        ],
        rows,
        searchKeys: ['nombre'],
        actions: [
          { icon: 'bi-pencil', title: 'Editar', className: 'btn-outline-primary', onClick: (r) => abrir(r) },
          { icon: 'bi-trash', title: 'Dar de baja', className: 'btn-outline-danger', onClick: darDeBaja },
        ],
      }));
    } catch (err) {
      clear(tableWrap);
      tableWrap.append(h('div', { class: 'alert alert-danger' }, `Error al cargar: ${err.message}`));
    }
  }

  load();
}

/**
 * Modal de alta/edición de promoción con selector de productos buscable (varios).
 * Resuelve { nombre, precio, fechaDesde, fechaHasta, productoIds } o null.
 */
function promoModal({ productos, promo }) {
  return new Promise((resolve) => {
    const seleccion = new Set((promo?.productos || []).map((p) => Number(p.productoId)));

    const nombre = h('input', { class: 'form-control', value: promo?.nombre || '' });
    const precio = h('input', { class: 'form-control', type: 'number', min: 0, step: '0.01', value: promo?.precio ?? '' });
    const desde = h('input', { class: 'form-control', type: 'date', value: promo?.fechaDesde || '' });
    const hasta = h('input', { class: 'form-control', type: 'date', value: promo?.fechaHasta || '' });

    const buscar = h('input', { class: 'form-control mb-2', placeholder: 'Buscar producto por nombre o código...', autocomplete: 'off' });
    const lista = h('div', { class: 'border rounded p-2', style: { maxHeight: '240px', overflowY: 'auto' } });
    const contador = h('div', { class: 'form-text' });

    const actualizarContador = () => { contador.textContent = `${seleccion.size} producto(s) seleccionado(s).`; };
    function pintar() {
      const t = buscar.value.trim().toLowerCase();
      const filtrados = productos.filter((p) =>
        !t || String(p.nombre || '').toLowerCase().includes(t) || String(p.codigoProducto || '').toLowerCase().includes(t));
      clear(lista);
      if (!filtrados.length) { lista.append(h('div', { class: 'text-muted small' }, 'Sin resultados.')); return; }
      for (const p of filtrados.slice(0, 200)) {
        const cb = h('input', { class: 'form-check-input', type: 'checkbox', id: `pp-${p.id}`, checked: seleccion.has(Number(p.id)) });
        cb.addEventListener('change', () => { if (cb.checked) seleccion.add(Number(p.id)); else seleccion.delete(Number(p.id)); actualizarContador(); });
        lista.append(h('div', { class: 'form-check' }, [
          cb, h('label', { class: 'form-check-label', for: `pp-${p.id}` },
            `${p.nombre} — ${fmt.money(p.precio)} (cód: ${p.codigoProducto})`),
        ]));
      }
      if (filtrados.length > 200) lista.append(h('div', { class: 'text-muted small mt-1' }, `Se muestran 200 de ${filtrados.length}. Afiná la búsqueda.`));
    }
    buscar.addEventListener('input', pintar);

    const errorBox = h('div', { class: 'alert alert-danger d-none py-2' });
    const campo = (label, input, col = 'col-md-6') => h('div', { class: col }, [h('label', { class: 'form-label' }, label), input]);

    const modalEl = h('div', { class: 'modal fade', tabindex: '-1' }, [
      h('div', { class: 'modal-dialog modal-dialog-centered modal-lg' }, [
        h('div', { class: 'modal-content' }, [
          h('div', { class: 'modal-header' }, [
            h('h5', { class: 'modal-title' }, promo ? 'Editar promoción' : 'Nueva promoción'),
            h('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal' }),
          ]),
          h('div', { class: 'modal-body' }, [
            errorBox,
            h('div', { class: 'row g-3 mb-3' }, [
              campo('Nombre de la promoción', nombre, 'col-12'),
              campo('Precio especial (por producto)', precio),
              h('div', { class: 'col-md-6' }),
              campo('Desde (opcional)', desde),
              campo('Hasta (opcional, vacío = sin fin)', hasta),
            ]),
            h('label', { class: 'form-label' }, 'Productos de la promoción'),
            buscar, lista, contador,
          ]),
          h('div', { class: 'modal-footer' }, [
            h('button', { type: 'button', class: 'btn btn-secondary', 'data-bs-dismiss': 'modal' }, 'Cancelar'),
            h('button', { type: 'button', class: 'btn btn-primary', id: 'promo-guardar' }, 'Guardar'),
          ]),
        ]),
      ]),
    ]);

    document.body.append(modalEl);
    const modal = new bootstrap.Modal(modalEl);
    let guardado = false;
    pintar();
    actualizarContador();

    modalEl.querySelector('#promo-guardar').addEventListener('click', () => {
      const n = nombre.value.trim();
      const pr = Number(precio.value);
      const error = !n ? 'Poné un nombre a la promoción.'
        : (!Number.isFinite(pr) || pr < 0) ? 'El precio no es válido.'
          : seleccion.size === 0 ? 'Elegí al menos un producto.'
            : (desde.value && hasta.value && hasta.value < desde.value) ? 'La fecha "hasta" no puede ser anterior a "desde".'
              : null;
      if (error) { errorBox.textContent = error; errorBox.classList.remove('d-none'); return; }
      guardado = true;
      modal.hide();
      resolve({ nombre: n, precio: pr, fechaDesde: desde.value || null, fechaHasta: hasta.value || null, productoIds: [...seleccion] });
    });
    modalEl.addEventListener('hidden.bs.modal', () => {
      try { modal.dispose(); } catch { /* ignore */ }
      modalEl.remove();
      if (!document.querySelector('.modal.show')) {
        document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
      }
      if (!guardado) resolve(null);
    });
    modal.show();
  });
}
