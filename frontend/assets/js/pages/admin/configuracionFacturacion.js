// Configuración de facturación (administrador): PINes de anulación (hasta 3) y el
// límite de crédito por defecto para las cuentas nuevas. Scoped por sucursal.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, badge } from '../../components/page.js';
import { formModal } from '../../components/formModal.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { sucursalSelect } from '../../components/sucursalSelect.js';

const MAX_PINES = 3;

export function configuracionFacturacionPage() {
  const content = renderShell('Configuración');
  content.append(pageHeader('Configuración de facturación', 'PINes de anulación y límite de crédito por defecto.'));

  content.append(h('div', { class: 'sk-card p-3 mb-3' }, [sucursalSelect(() => render())]));

  const panel = h('div');
  content.append(panel);

  async function render() {
    clear(panel);
    const sp = spinner('Cargando configuración...');
    panel.append(sp);
    const sucursalId = sucursalActiva();
    try {
      const [sucursal, pines, correo] = await Promise.all([
        api.get(`/sucursales/${sucursalId}`),
        api.get(`/sucursales/${sucursalId}/pines`),
        api.get(`/sucursales/${sucursalId}/smtp`).catch(() => ({ configurado: false })),
      ]);
      clear(panel);
      panel.append(bloqueLimite(sucursalId, sucursal), bloquePines(sucursalId, pines), bloqueCorreo(correo));
    } catch (err) {
      clear(panel);
      panel.append(h('div', { class: 'alert alert-danger' }, `Error: ${err.message}`));
    }
  }

  // ---- Límite de crédito por defecto ----
  function bloqueLimite(sucursalId, sucursal) {
    const input = h('input', {
      class: 'form-control', type: 'number', min: 0, step: '0.01',
      value: Number(sucursal.limiteCreditoDefault || 0), style: { maxWidth: '220px' },
    });
    const btn = h('button', { class: 'btn btn-primary' }, [h('i', { class: 'bi bi-save me-1' }), 'Guardar']);
    btn.addEventListener('click', async () => {
      const limite = Number(input.value);
      if (!Number.isFinite(limite) || limite < 0) { ui.error('Ingresá un monto válido (0 = sin límite).'); return; }
      ui.loading('Guardando...');
      try {
        await api.put(`/sucursales/${sucursalId}`, { limiteCreditoDefault: limite });
        ui.close(); ui.success('Límite por defecto guardado.');
      } catch (err) { ui.close(); ui.error(err.message); }
    });
    return h('div', { class: 'sk-card p-4 mb-3' }, [
      h('h6', { class: 'mb-1' }, 'Límite de crédito por defecto'),
      h('p', { class: 'text-muted small mb-2' }, 'Se aplica a las cuentas de cliente NUEVAS de esta sucursal. 0 = sin límite. No cambia los límites de clientes ya existentes.'),
      h('div', { class: 'd-flex align-items-center gap-2' }, [input, btn]),
    ]);
  }

  // ---- PINes de anulación ----
  function bloquePines(sucursalId, pines) {
    const lista = h('div', { class: 'mb-3' });
    const pintar = (items) => {
      clear(lista);
      if (!items.length) {
        lista.append(h('div', { class: 'text-warning-emphasis small' }, 'Sin PINes: el cajero no podrá anular ventas hasta que agregues al menos uno.'));
      }
      for (const p of items) {
        const row = h('div', { class: 'd-flex align-items-center justify-content-between border rounded p-2 mb-2' }, [
          h('div', {}, [
            h('span', { class: 'fw-semibold me-2' }, [h('i', { class: 'bi bi-key me-1' }), p.etiqueta || 'PIN']),
            badge(p.activo ? 'Activo' : 'Inactivo', p.activo ? 'success' : 'secondary'),
          ]),
          h('div', { class: 'd-flex gap-1' }, [
            h('button', { class: 'btn btn-sm btn-outline-primary', title: 'Modificar', onClick: () => editar(p) }, [h('i', { class: 'bi bi-pencil' })]),
            h('button', { class: 'btn btn-sm btn-outline-danger', title: 'Eliminar', onClick: () => borrar(p) }, [h('i', { class: 'bi bi-trash' })]),
          ]),
        ]);
        lista.append(row);
      }
      addBtn.disabled = items.filter((x) => x.activo).length >= MAX_PINES;
    };

    const addBtn = h('button', { class: 'btn btn-outline-success' }, [h('i', { class: 'bi bi-plus-lg me-1' }), 'Agregar PIN']);
    addBtn.addEventListener('click', agregar);

    async function recargar() {
      try { pintar(await api.get(`/sucursales/${sucursalId}/pines`)); }
      catch (err) { ui.error(err.message); }
    }

    async function agregar() {
      const v = await formModal({
        title: 'Nuevo PIN de anulación', submitText: 'Agregar',
        fields: [
          { name: 'pin', label: 'PIN', required: true, colClass: 'col-md-6', placeholder: 'Ej: 1234', autocomplete: 'off' },
          { name: 'etiqueta', label: 'Etiqueta (quién lo usa)', colClass: 'col-md-6', placeholder: 'Ej: Supervisor Juan' },
        ],
      });
      if (!v) return;
      ui.loading('Guardando...');
      try { await api.post(`/sucursales/${sucursalId}/pines`, { pin: v.pin, etiqueta: v.etiqueta || null }); ui.close(); await recargar(); }
      catch (err) { ui.close(); ui.error(err.message); }
    }

    async function editar(p) {
      const v = await formModal({
        title: `Modificar PIN${p.etiqueta ? ` · ${p.etiqueta}` : ''}`, submitText: 'Guardar',
        fields: [
          { name: 'pin', label: 'Nuevo PIN', colClass: 'col-md-6', placeholder: 'Dejar vacío para no cambiarlo', autocomplete: 'off' },
          { name: 'etiqueta', label: 'Etiqueta', value: p.etiqueta, colClass: 'col-md-6' },
          { name: 'activo', label: 'Activo', type: 'checkbox', value: p.activo },
        ],
      });
      if (!v) return;
      ui.loading('Guardando...');
      try {
        await api.put(`/sucursales/${sucursalId}/pines/${p.id}`, { pin: v.pin || undefined, etiqueta: v.etiqueta || null, activo: v.activo });
        ui.close(); await recargar();
      } catch (err) { ui.close(); ui.error(err.message); }
    }

    async function borrar(p) {
      const ok = await ui.confirm(`¿Eliminar el PIN ${p.etiqueta || ''}?`, { confirmText: 'Eliminar' });
      if (!ok) return;
      ui.loading('Eliminando...');
      try { await api.del(`/sucursales/${sucursalId}/pines/${p.id}`); ui.close(); await recargar(); }
      catch (err) { ui.close(); ui.error(err.message); }
    }

    pintar(pines);
    return h('div', { class: 'sk-card p-4 mb-3' }, [
      h('h6', { class: 'mb-1' }, 'PINes de anulación de ventas'),
      h('p', { class: 'text-muted small mb-2' }, `El cajero ingresa uno de estos PINes (se lo pide a un supervisor) para anular una venta. Hasta ${MAX_PINES} activos.`),
      lista,
      addBtn,
    ]);
  }

  function bloqueCorreo(correo) {
    const detalle = correo.propia
      ? `Usa la casilla propia de la sucursal${correo.user ? ` (${correo.user})` : ''}.`
      : correo.configurado
        ? 'Usa la configuración de correo global del servidor (.env).'
        : 'Para enviar los estados de cuenta, el superadministrador debe cargar el correo y la contraseña de aplicación en el formulario de la sucursal.';
    return h('div', { class: 'sk-card p-4' }, [
      h('h6', { class: 'mb-1' }, 'Envío de correo'),
      h('div', { class: 'd-flex align-items-center gap-2' }, [
        badge(correo.configurado ? 'Configurado' : 'No configurado', correo.configurado ? 'success' : 'secondary'),
        h('span', { class: 'text-muted small' }, detalle),
      ]),
    ]);
  }

  render();
}
