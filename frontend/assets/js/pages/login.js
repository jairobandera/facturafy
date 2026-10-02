import { h, clear } from '../core/dom.js';
import { auth } from '../core/auth.js';
import { router } from '../core/router.js';
import { ui } from '../core/ui.js';
import { resetShell } from '../core/layout.js';
import { cargarSucursal, limpiarSucursal } from '../core/sucursal.js';

export function loginPage() {
  resetShell();
  const app = document.getElementById('app');
  clear(app);

  // Si ya hay sesion valida, ir directo al dashboard.
  if (auth.isAuthenticated() && !auth.isExpired()) {
    router.navigate(auth.homeRoute().replace('#', ''));
    return;
  }
  // Se llega aca tambien al cerrar sesion: la config de la sucursal es de ese usuario.
  limpiarSucursal();

  const userInput = h('input', { class: 'form-control', id: 'login-user', placeholder: 'Nombre de usuario', autofocus: true });
  const passInput = h('input', { class: 'form-control', id: 'login-pass', type: 'password', placeholder: 'Contraseña' });
  const btn = h('button', { class: 'btn btn-primary w-100 py-2', type: 'submit' }, 'Ingresar');

  const form = h('form', { class: 'mt-3' }, [
    h('div', { class: 'mb-3' }, [h('label', { class: 'form-label' }, 'Usuario'), userInput]),
    h('div', { class: 'mb-3' }, [h('label', { class: 'form-label' }, 'Contraseña'), passInput]),
    btn,
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombreUsuario = userInput.value.trim();
    const contrasenia = passInput.value;
    if (!nombreUsuario || !contrasenia) { ui.error('Ingresa usuario y contraseña.'); return; }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Ingresando...';
    try {
      await auth.login(nombreUsuario, contrasenia);
      await cargarSucursal();
      resetShell();
      router.navigate(auth.homeRoute().replace('#', ''));
    } catch (err) {
      ui.error(err.message || 'No se pudo iniciar sesión.');
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  });

  app.append(h('div', { class: 'sk-login-wrap' }, [
    h('div', { class: 'sk-login-card' }, [
      h('div', { class: 'sk-login-logo' }, [
        h('i', { class: 'bi bi-box-seam-fill' }),
        h('h1', {}, 'Stockify'),
        h('p', { class: 'text-muted mb-0' }, 'Gestión de inventario'),
      ]),
      form,
      h('p', { class: 'text-center text-muted small mt-4 mb-0' },
        'Usuarios demo: superadmin / admin / empleado (clave 12345)'),
    ]),
  ]));
}
