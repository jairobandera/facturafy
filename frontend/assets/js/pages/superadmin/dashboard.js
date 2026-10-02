import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { router } from '../../core/router.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner } from '../../components/page.js';
import { statCard, quickCard } from '../../components/cards.js';

export async function superadminDashboard() {
  const content = renderShell('Dashboard');
  content.append(pageHeader('Panel de Super Administrador', 'Gestión global de empresas, sucursales y usuarios.'));
  const loading = spinner();
  content.append(loading);

  try {
    const [empresas, sucursales, usuarios] = await Promise.all([
      api.get('/empresas'), api.get('/sucursales'), api.get('/usuarios'),
    ]);
    loading.remove();

    content.append(h('div', { class: 'row g-3 mb-4' }, [
      col(statCard('Empresas', empresas.length, 'bi-building', '#2563eb')),
      col(statCard('Sucursales', sucursales.length, 'bi-shop', '#0891b2')),
      col(statCard('Usuarios', usuarios.length, 'bi-people', '#7c3aed')),
    ]));

    content.append(h('h5', { class: 'fw-semibold mb-3' }, 'Accesos rápidos'));
    content.append(h('div', { class: 'row g-3' }, [
      col(quickCard('Crear empresa', 'bi-plus-circle', '#/superadmin/crear-empresa')),
      col(quickCard('Ver empresas', 'bi-building', '#/superadmin/ver-empresas')),
      col(quickCard('Agregar sucursal', 'bi-shop', '#/superadmin/agregar-sucursal')),
      col(quickCard('Crear usuario', 'bi-person-plus', '#/superadmin/crear-usuario')),
      col(quickCard('Ver usuarios', 'bi-people', '#/superadmin/ver-usuarios')),
    ]));
  } catch (err) {
    loading.remove();
    content.append(h('div', { class: 'alert alert-danger' }, `No se pudieron cargar los datos: ${err.message}`));
  }
}

const col = (child) => h('div', { class: 'col-12 col-sm-6 col-lg-3' }, child);
