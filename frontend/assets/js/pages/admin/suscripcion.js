// Suscripción (administrador): ve el estado de su empresa y puede ingresar una clave de
// activación para renovar ANTES de quedar bloqueado. (Si ya está vencida, la misma clave
// se ingresa en la pantalla de bloqueo). Disponible en cualquier paquete.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, badge } from '../../components/page.js';
import { cargarSuscripcion } from '../../core/suscripcion.js';

export function suscripcionAdminPage() {
  const content = renderShell('Suscripción');
  content.append(pageHeader('Suscripción', 'Estado de tu suscripción e ingreso de la clave de activación.'));

  const panel = h('div');
  content.append(panel);

  async function load() {
    clear(panel);
    const sp = spinner('Cargando...');
    panel.append(sp);
    let est;
    try { est = await api.get('/suscripcion/estado'); }
    catch (err) { clear(panel); panel.append(h('div', { class: 'alert alert-danger' }, err.message)); return; }
    clear(panel);

    // ---- Estado ----
    let estadoBadge, detalle;
    if (est.ilimitada) {
      estadoBadge = badge('Ilimitada', 'primary');
      detalle = 'Tu suscripción no tiene vencimiento.';
    } else if (est.bloqueada) {
      estadoBadge = badge('Vencida', 'danger');
      detalle = `Venció el ${fmt.date(est.vigenteHasta)}. Ingresá una clave para reactivar.`;
    } else if (est.enPrueba) {
      estadoBadge = badge('Prueba gratis', 'info');
      detalle = `Te queda(n) ${est.diasRestantes} día(s) de prueba (hasta el ${fmt.date(est.vigenteHasta)}).`;
    } else {
      estadoBadge = badge('Vigente', 'success');
      detalle = `Vigente hasta el ${fmt.date(est.vigenteHasta)} (${est.diasRestantes} día(s) restantes).`;
    }

    panel.append(h('div', { class: 'sk-card p-4 mb-3' }, [
      h('div', { class: 'd-flex align-items-center gap-2 mb-2' }, [
        h('h6', { class: 'mb-0 me-1' }, 'Estado'), estadoBadge,
      ]),
      h('p', { class: 'text-muted mb-0' }, detalle),
    ]));

    // ---- Ingresar clave ----
    const input = h('input', { class: 'form-control form-control-lg', placeholder: 'STK-XXXX-XXXX-XXXX', autocomplete: 'off' });
    const btn = h('button', { class: 'btn btn-primary' }, [h('i', { class: 'bi bi-key me-1' }), 'Activar']);
    btn.addEventListener('click', async () => {
      const codigo = input.value.trim();
      if (!codigo) { ui.error('Ingresá la clave de activación.'); return; }
      ui.loading('Activando...');
      try {
        await api.post('/suscripcion/activar', { codigo });
        await cargarSuscripcion(); // refresca el aviso del sidebar
        ui.close();
        await ui.success('¡Suscripción activada!');
        await load();
      } catch (err) { ui.close(); ui.error(err.message); }
    });

    panel.append(h('div', { class: 'sk-card p-4' }, [
      h('h6', { class: 'mb-1' }, 'Ingresar clave de activación'),
      h('p', { class: 'text-muted small mb-2' }, 'Pedila al proveedor. Suma días a tu suscripción (se puede renovar antes de que venza).'),
      est.ilimitada
        ? h('div', { class: 'text-muted' }, 'Tu suscripción es ilimitada: no necesitás clave.')
        : h('div', { class: 'd-flex flex-wrap gap-2 align-items-center' }, [input, btn]),
    ]));
  }

  load();
}
