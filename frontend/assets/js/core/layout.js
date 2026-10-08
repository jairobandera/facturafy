// Renderiza el "shell" de la aplicacion (sidebar + topbar) y provee el area de contenido.
import { h, clear } from './dom.js';
import { auth } from './auth.js';
import { usaLotes, usaStock, usaFacturacion, usaEnvioCorreos } from './sucursal.js';

// El inventario (productos/categorias/proveedores) solo tiene sentido con stock o
// facturacion; en el paquete "solo envio de correos" se oculta por completo.
const usaInventario = () => usaStock() || usaFacturacion();

// Secciones/items con `oculto: true` desaparecen cuando su `requiere()` da false
// (paquetes de la sucursal). Los que tienen `requiere` sin `oculto` (Lotes) se
// muestran en gris con candado, como hasta ahora.
const NAV = {
  SUPERADMINISTRADOR: [
    { icon: 'bi-speedometer2', label: 'Dashboard', href: '#/superadmin/dashboard', standalone: true },
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
    { icon: 'bi-speedometer2', label: 'Dashboard', href: '#/admin/dashboard', standalone: true },
    { section: 'Inventario', requiere: usaInventario, oculto: true },
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
    // Clientes (paquete usa_facturacion) en su propio apartado
    { section: 'Clientes', requiere: usaFacturacion, oculto: true },
    { icon: 'bi-person-vcard', label: 'Clientes', href: '#/admin/clientes', requiere: usaFacturacion, oculto: true },
    // Facturacion (paquete usa_facturacion)
    { section: 'Facturacion', requiere: usaFacturacion, oculto: true },
    { icon: 'bi-receipt', label: 'Ventas realizadas', href: '#/admin/ventas', requiere: usaFacturacion, oculto: true },
    { icon: 'bi-clock-history', label: 'Turnos', href: '#/admin/turnos', requiere: usaFacturacion, oculto: true },
    { icon: 'bi-bar-chart-line', label: 'Estadisticas de facturacion', href: '#/admin/estadisticas-facturacion', requiere: usaFacturacion, oculto: true },
    // Configuracion queda suelta (sin apartado)
    { icon: 'bi-sliders', label: 'Configuracion', href: '#/admin/configuracion', requiere: usaFacturacion, oculto: true, standalone: true },
    // Envio de correos (paquete "Solo envio de correos")
    { section: 'Correos', requiere: usaEnvioCorreos, oculto: true },
    { icon: 'bi-person-lines-fill', label: 'Contactos', href: '#/admin/correos-contactos', requiere: usaEnvioCorreos, oculto: true },
    { icon: 'bi-envelope-paper', label: 'Enviar quincena', href: '#/admin/correos-enviar', requiere: usaEnvioCorreos, oculto: true },
    { icon: 'bi-clock-history', label: 'Historial de envios', href: '#/admin/correos-historial', requiere: usaEnvioCorreos, oculto: true },
  ],
  EMPLEADO: [
    { icon: 'bi-speedometer2', label: 'Dashboard', href: '#/empleado/dashboard', standalone: true },
  ],
  CAJERO: [
    { icon: 'bi-speedometer2', label: 'Dashboard', href: '#/facturacion/dashboard', standalone: true },
    { section: 'Facturacion' },
    { icon: 'bi-cart-plus', label: 'Punto de venta', href: '#/facturacion/pos' },
    { section: 'Turno' },
    { icon: 'bi-receipt', label: 'Ventas del turno', href: '#/facturacion/ventas-turno' },
    { icon: 'bi-door-closed', label: 'Cerrar turno', href: '#/facturacion/cerrar-turno' },
  ],
};

// Estado de secciones colapsadas, por rol, persistido en localStorage.
function navKey(role) { return `sk_nav_collapsed_${role}`; }
function leerColapsadas(role) {
  try { return new Set(JSON.parse(localStorage.getItem(navKey(role)) || '[]')); } catch { return new Set(); }
}
function guardarColapsadas(role, set) {
  try { localStorage.setItem(navKey(role), JSON.stringify([...set])); } catch { /* modo privado */ }
}

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
  const items = NAV[role] || [];
  const estaOculto = (item) => item.oculto && item.requiere && !item.requiere();

  const navEl = h('ul', { class: 'sk-nav' });
  const colapsadas = leerColapsadas(role);
  const grupos = []; // { nombre, grupoEl }

  // Boton "Contraer/Expandir todo" (solo si hay secciones).
  const toggleAll = h('button', { class: 'sk-nav-toggle-all' });
  navEl.append(toggleAll);

  function makeLink(item) {
    // Apartado opcional deshabilitado para esta sucursal: gris y sin enlace.
    if (item.requiere && !item.requiere()) {
      return h('span', {
        class: 'sk-nav-disabled',
        title: 'Apartado no habilitado para esta sucursal. Lo activa el superadministrador.',
      }, [h('i', { class: `bi ${item.icon}` }), item.label, h('i', { class: 'bi bi-lock-fill ms-auto' })]);
    }
    return h('a', { href: item.href, dataset: { href: item.href }, onClick: closeSidebar }, [
      h('i', { class: `bi ${item.icon}` }), item.label,
    ]);
  }

  let itemsActual = null; // contenedor de la seccion en curso
  let saltando = false;   // la seccion en curso esta oculta: se saltan sus items

  for (const item of items) {
    if (item.section) {
      // Seccion oculta (no aplica el paquete): se oculta el titulo Y sus items.
      if (estaOculto(item)) { saltando = true; itemsActual = null; continue; }
      saltando = false;
      const caret = h('i', { class: 'bi bi-chevron-down sk-nav-caret' });
      const header = h('div', { class: 'sk-nav-section' }, [h('span', {}, item.section), caret]);
      const itemsEl = h('div', { class: 'sk-nav-group-items' });
      const grupoEl = h('div', { class: 'sk-nav-group' }, [header, itemsEl]);
      if (colapsadas.has(item.section)) grupoEl.classList.add('collapsed');
      header.addEventListener('click', () => {
        grupoEl.classList.toggle('collapsed');
        if (grupoEl.classList.contains('collapsed')) colapsadas.add(item.section);
        else colapsadas.delete(item.section);
        guardarColapsadas(role, colapsadas);
        refrescarToggleAll();
      });
      navEl.append(grupoEl);
      grupos.push({ nombre: item.section, grupoEl });
      itemsActual = itemsEl;
    } else if (item.standalone) {
      saltando = false;
      itemsActual = null;
      if (!estaOculto(item)) navEl.append(makeLink(item)); // Dashboard / Configuracion sueltos
    } else {
      if (saltando) continue;                 // item de una seccion oculta
      if (estaOculto(item)) continue;         // item con su propio oculto
      (itemsActual || navEl).append(makeLink(item));
    }
  }

  function refrescarToggleAll() {
    const todasColapsadas = grupos.length > 0 && grupos.every((g) => g.grupoEl.classList.contains('collapsed'));
    toggleAll.innerHTML = '';
    toggleAll.append(
      h('i', { class: `bi ${todasColapsadas ? 'bi-chevron-bar-down' : 'bi-chevron-bar-up'}` }),
      todasColapsadas ? 'Expandir todo' : 'Contraer todo',
    );
  }
  toggleAll.addEventListener('click', () => {
    const todasColapsadas = grupos.every((g) => g.grupoEl.classList.contains('collapsed'));
    for (const g of grupos) {
      if (todasColapsadas) { g.grupoEl.classList.remove('collapsed'); colapsadas.delete(g.nombre); }
      else { g.grupoEl.classList.add('collapsed'); colapsadas.add(g.nombre); }
    }
    guardarColapsadas(role, colapsadas);
    refrescarToggleAll();
  });
  if (grupos.length === 0) toggleAll.classList.add('d-none');
  refrescarToggleAll();

  return h('aside', { class: 'sk-sidebar', id: 'sk-sidebar' }, [
    h('div', { class: 'sk-sidebar-brand' }, [h('i', { class: 'bi bi-receipt-cutoff' }), 'Facturafy']),
    navEl,
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
