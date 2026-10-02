// Renderiza el "shell" de la aplicacion (sidebar + topbar) y provee el area de contenido.
import { h, clear } from './dom.js';
import { auth } from './auth.js';
import { usaLotes, usaStock, usaFacturacion } from './sucursal.js';

// Secciones/items con `oculto: true` desaparecen cuando su `requiere()` da false
// (paquetes de la sucursal). Los que tienen `requiere` sin `oculto` (Lotes) se
// muestran en gris con candado, como hasta ahora.
const NAV = {
  SUPERADMINISTRADOR: [
    { section: 'General' },
    { icon: 'bi-speedometer2', label: 'Dashboard', href: '#/superadmin/dashboard' },
    { section: 'Empresas' },
    { icon: 'bi-building', label: 'Ver empresas', href: '#/superadmin/ver-empresas' },
    { icon: 'bi-plus-circle', label: 'Crear empresa', href: '#/superadmin/crear-empresa' },
    { section: 'Sucursales' },
    { icon: 'bi-shop', label: 'Ver sucursales', href: '#/superadmin/ver-sucursales' },
    { icon: 'bi-plus-circle', label: 'Agregar sucursal', href: '#/superadmin/agregar-sucursal' },
    { section: 'Usuarios' },
    { icon: 'bi-people', label: 'Ver usuarios', href: '#/superadmin/ver-usuarios' },
    { icon: 'bi-person-plus', label: 'Crear usuario', href: '#/superadmin/crear-usuario' },
    { section: 'Configuracion' },
    { icon: 'bi-sliders', label: 'Configuraciones', href: '#/superadmin/configuraciones' },
  ],
  ADMINISTRADOR: [
    { section: 'General' },
    { icon: 'bi-speedometer2', label: 'Dashboard', href: '#/admin/dashboard' },
    { section: 'Inventario' },
    { icon: 'bi-tags', label: 'Categorias', href: '#/admin/gestionar-categorias' },
    { icon: 'bi-box-seam', label: 'Productos', href: '#/admin/gestionar-productos' },
    { icon: 'bi-boxes', label: 'Lotes', href: '#/admin/gestionar-lotes', requiere: usaLotes },
    { icon: 'bi-truck', label: 'Proveedores', href: '#/admin/gestionar-proveedores' },
    { icon: 'bi-file-earmark-arrow-down', label: 'Plantillas', href: '#/admin/plantillas' },
    // Control de stock (paquete usa_stock)
    { section: 'Control de stock', requiere: usaStock, oculto: true },
    { icon: 'bi-clipboard-check', label: 'Conteos', href: '#/admin/gestionar-conteos', requiere: usaStock, oculto: true },
    { icon: 'bi-clipboard-data', label: 'Conteos finalizados', href: '#/admin/conteos-finalizados', requiere: usaStock, oculto: true },
    { icon: 'bi-people', label: 'Empleados', href: '#/admin/gestionar-empleados', requiere: usaStock, oculto: true },
    { icon: 'bi-graph-up', label: 'Estadisticas de conteos', href: '#/admin/estadisticas', requiere: usaStock, oculto: true },
    // Facturacion (paquete usa_facturacion)
    { section: 'Facturacion', requiere: usaFacturacion, oculto: true },
    { icon: 'bi-receipt', label: 'Ventas realizadas', href: '#/admin/ventas', requiere: usaFacturacion, oculto: true },
    { icon: 'bi-person-vcard', label: 'Clientes', href: '#/admin/clientes', requiere: usaFacturacion, oculto: true },
    { icon: 'bi-bar-chart-line', label: 'Estadisticas de facturacion', href: '#/admin/estadisticas-facturacion', requiere: usaFacturacion, oculto: true },
  ],
  EMPLEADO: [
    { section: 'General' },
    { icon: 'bi-speedometer2', label: 'Dashboard', href: '#/empleado/dashboard' },
  ],
  CAJERO: [
    { section: 'General' },
    { icon: 'bi-speedometer2', label: 'Dashboard', href: '#/facturacion/dashboard' },
    { section: 'Facturacion' },
    { icon: 'bi-cart-plus', label: 'Punto de venta', href: '#/facturacion/pos' },
    { icon: 'bi-person-vcard', label: 'Clientes', href: '#/facturacion/clientes' },
  ],
};

const ROLE_LABEL = {
  SUPERADMINISTRADOR: 'Super Admin',
  ADMINISTRADOR: 'Administrador',
  EMPLEADO: 'Empleado',
  CAJERO: 'Cajero',
};

let contentEl = null;

/**
 * Asegura que el shell este montado. Devuelve el contenedor de contenido.
 * @param {string} title  Titulo mostrado en la topbar.
 */
export function renderShell(title) {
  const app = document.getElementById('app');
  const role = auth.getRole();

  if (!document.getElementById('sk-shell')) {
    clear(app);
    const sidebar = buildSidebar(role);
    const backdrop = h('div', { class: 'sk-backdrop', id: 'sk-backdrop', onClick: closeSidebar });
    contentEl = h('div', { class: 'sk-content', id: 'sk-content' });
    const topbar = buildTopbar(title);
    const main = h('div', { class: 'sk-main' }, [topbar, contentEl]);
    const shell = h('div', { class: 'sk-layout', id: 'sk-shell' }, [sidebar, main, backdrop]);
    app.append(shell);
  }

  document.getElementById('sk-topbar-title').textContent = title;
  highlightActive();
  clear(contentEl);
  return contentEl;
}

/** Fuerza a reconstruir el shell (por ejemplo tras cambiar de rol). */
export function resetShell() {
  const existing = document.getElementById('sk-shell');
  if (existing) existing.remove();
  contentEl = null;
}

function buildSidebar(role) {
  const items = (NAV[role] || [])
    // Items/secciones con `oculto`: se quitan del todo cuando no aplica el paquete.
    .filter((item) => !(item.oculto && item.requiere && !item.requiere()))
    .map((item) => {
      if (item.section) return h('div', { class: 'sk-nav-section' }, item.section);
      // Apartado opcional deshabilitado para esta sucursal: se muestra en gris y sin enlace.
      if (item.requiere && !item.requiere()) {
      return h('span', {
        class: 'sk-nav-disabled',
        title: 'Apartado no habilitado para esta sucursal. Lo activa el superadministrador.',
      }, [h('i', { class: `bi ${item.icon}` }), item.label, h('i', { class: 'bi bi-lock-fill ms-auto' })]);
    }
    return h('a', { href: item.href, dataset: { href: item.href }, onClick: closeSidebar }, [
      h('i', { class: `bi ${item.icon}` }), item.label,
    ]);
  });
  return h('aside', { class: 'sk-sidebar', id: 'sk-sidebar' }, [
    h('div', { class: 'sk-sidebar-brand' }, [h('i', { class: 'bi bi-receipt-cutoff' }), 'Facturafy']),
    h('ul', { class: 'sk-nav' }, items),
    h('div', { style: { padding: '1rem' } }, [
      h('button', { class: 'btn btn-outline-light btn-sm w-100', onClick: () => auth.logout() },
        [h('i', { class: 'bi bi-box-arrow-right me-1' }), 'Cerrar sesion']),
    ]),
  ]);
}

function buildTopbar(title) {
  const username = auth.getUsername();
  const initial = (username[0] || 'U').toUpperCase();
  return h('header', { class: 'sk-topbar' }, [
    h('div', { class: 'd-flex align-items-center gap-2' }, [
      h('button', { class: 'sk-sidebar-toggle', onClick: toggleSidebar }, [h('i', { class: 'bi bi-list' })]),
      h('h2', { id: 'sk-topbar-title' }, title),
    ]),
    h('div', { class: 'sk-user-chip' }, [
      h('div', { class: 'text-end d-none d-sm-block' }, [
        h('div', { style: { fontWeight: 600, fontSize: '.9rem' } }, username),
        h('div', { style: { fontSize: '.75rem', color: '#64748b' } }, ROLE_LABEL[auth.getRole()] || ''),
      ]),
      h('div', { class: 'sk-avatar' }, initial),
    ]),
  ]);
}

function highlightActive() {
  const current = window.location.hash.split('?')[0];
  document.querySelectorAll('.sk-nav a').forEach((a) => {
    const href = a.dataset.href;
    a.classList.toggle('active', current === href || current.startsWith(href + '/'));
  });
}

function toggleSidebar() {
  document.getElementById('sk-sidebar')?.classList.toggle('open');
  document.getElementById('sk-backdrop')?.classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sk-sidebar')?.classList.remove('open');
  document.getElementById('sk-backdrop')?.classList.remove('show');
}
