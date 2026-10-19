// Pantalla de bloqueo por suscripcion vencida. El ADMINISTRADOR puede ingresar la clave
// de activacion; los demas roles ven un aviso para contactar al administrador.
import { h, clear } from '../../core/dom.js';
import { auth } from '../../core/auth.js';
import { router } from '../../core/router.js';
import { ui } from '../../core/ui.js';
import { api } from '../../core/api.js';
import { resetShell } from '../../core/layout.js';
import { cargarSuscripcion, suscripcionEstado } from '../../core/suscripcion.js';

export function bloqueoPage() {
  resetShell();
  const app = document.getElementById('app');
  clear(app);

  const esAdmin = auth.getRole() === 'ADMINISTRADOR';
  const est = suscripcionEstado();
  const enPrueba = est?.enPrueba;

  const cuerpo = [];
  cuerpo.push(h('div', { class: 'text-center mb-3' }, [
    h('i', { class: 'bi bi-lock-fill text-danger', style: { fontSize: '2.5rem' } }),
    h('h1', { class: 'h4 mt-2 mb-1' }, enPrueba ? 'Terminó la prueba gratis' : 'Suscripción vencida'),
    h('p', { class: 'text-muted mb-0' }, esAdmin
      ? 'Para seguir usando Stockify, ingresá la clave de activación que te dio el proveedor.'
      : 'El sistema está bloqueado. Contactá al administrador para que ingrese la clave de activación.'),
  ]));

  if (esAdmin) {
    const input = h('input', { class: 'form-control form-control-lg text-center', placeholder: 'STK-XXXX-XXXX-XXXX', autocomplete: 'off', autofocus: true });
    const btn = h('button', { class: 'btn btn-primary w-100 py-2', type: 'submit' }, [h('i', { class: 'bi bi-key me-1' }), 'Activar']);
    const form = h('form', { class: 'mt-3' }, [
      h('div', { class: 'mb-3' }, [h('label', { class: 'form-label' }, 'Clave de activación'), input]),
      btn,
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const codigo = input.value.trim();
      if (!codigo) { ui.error('Ingresá la clave de activación.'); return; }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Activando...';
      try {
        await api.post('/suscripcion/activar', { codigo });
        await cargarSuscripcion();
        await ui.success('¡Suscripción activada! Ya podés seguir usando el sistema.');
        resetShell();
        router.navigate(auth.homeRoute().replace('#', ''));
      } catch (err) {
        ui.error(err.message || 'No se pudo activar.');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-key me-1"></i>Activar';
      }
    });
    cuerpo.push(form);
  }

  cuerpo.push(h('button', {
    class: 'btn btn-outline-secondary w-100 mt-3', onClick: () => auth.logout(),
  }, [h('i', { class: 'bi bi-box-arrow-right me-1' }), 'Cerrar sesión']));

  app.append(h('div', { class: 'sk-login-wrap' }, [
    h('div', { class: 'sk-login-card' }, cuerpo),
  ]));
}
