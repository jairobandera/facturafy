import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { auth } from '../../core/auth.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner } from '../../components/page.js';
import { router } from '../../core/router.js';
import { statCard, quickCard } from '../../components/cards.js';
import { usaLotes, usaStock, usaFacturacion, usaEnvioCorreos } from '../../core/sucursal.js';

export async function adminDashboard() {
  const content = renderShell('Dashboard');
  content.append(pageHeader('Panel de Administrador', 'Inventario, stock y facturación de tu sucursal.'));
  const loading = spinner();
  content.append(loading);

  const sucursalId = auth.getSucursalId();
  // Los paquetes (stock / facturacion) y el apartado de Lotes los habilita el superadmin por sucursal.
  const lotesHabilitados = usaLotes();
  const stockOn = usaStock();
  const facturacionOn = usaFacturacion();
  const envioCorreosOn = usaEnvioCorreos();
  const inventarioOn = stockOn || facturacionOn;
  try {
    const [productos, categorias, proveedores, conteos, porVencer] = await Promise.all([
      inventarioOn && sucursalId ? api.get(`/productos/sucursal/${sucursalId}/activos`) : [],
      inventarioOn && sucursalId ? api.get(`/categorias/sucursal/${sucursalId}`) : [],
      inventarioOn && sucursalId ? api.get(`/proveedores/sucursal/${sucursalId}/activos`) : [],
      stockOn ? api.get('/conteos') : [],
      sucursalId && stockOn && lotesHabilitados ? api.get(`/lotes/sucursal/${sucursalId}/por-vencer?dias=30`) : [],
    ]);
    loading.remove();

    // Rojo si ya hay lotes vencidos, ambar si solo hay proximos a vencer.
    const hayVencidos = porVencer.some((l) => Number(l.diasRestantes) < 0);
    const colorLotes = hayVencidos ? '#dc2626' : (porVencer.length ? '#f59e0b' : '#64748b');

    if (inventarioOn) {
      content.append(h('div', { class: 'row g-3 mb-4' }, [
        colStat(statCard('Productos', productos.length, 'bi-box-seam', '#2563eb')),
        colStat(statCard('Categorías', categorias.length, 'bi-tags', '#0891b2')),
        colStat(statCard('Proveedores', proveedores.length, 'bi-truck', '#7c3aed')),
        stockOn ? colStat(statCard('Conteos activos', conteos.length, 'bi-clipboard-check', '#16a34a')) : null,
        stockOn && lotesHabilitados ? colStat(clickable(
          statCard('Lotes por vencer', porVencer.length, 'bi-hourglass-split', colorLotes),
          '#/admin/gestionar-lotes?filtro=porVencer'
        )) : null,
      ]));

      content.append(h('h5', { class: 'fw-semibold mb-3' }, 'Inventario'));
      content.append(h('div', { class: 'row g-3 mb-4' }, [
        col(quickCard('Productos', 'bi-box-seam', '#/admin/gestionar-productos')),
        col(quickCard('Categorías', 'bi-tags', '#/admin/gestionar-categorias')),
        col(quickCard('Lotes', 'bi-boxes', '#/admin/gestionar-lotes', {
          disabled: !lotesHabilitados,
          title: 'Apartado no habilitado para esta sucursal. Lo activa el superadministrador.',
        })),
        col(quickCard('Proveedores', 'bi-truck', '#/admin/gestionar-proveedores')),
      ]));
    }

    if (stockOn) {
      content.append(h('h5', { class: 'fw-semibold mb-3' }, 'Control de stock'));
      content.append(h('div', { class: 'row g-3 mb-4' }, [
        col(quickCard('Conteos', 'bi-clipboard-check', '#/admin/gestionar-conteos')),
        col(quickCard('Conteos finalizados', 'bi-clipboard-data', '#/admin/conteos-finalizados')),
        col(quickCard('Empleados', 'bi-people', '#/admin/gestionar-empleados')),
        col(quickCard('Estadísticas de conteos', 'bi-graph-up', '#/admin/estadisticas')),
      ]));
    }

    if (facturacionOn) {
      content.append(h('h5', { class: 'fw-semibold mb-3' }, 'Facturación'));
      content.append(h('div', { class: 'row g-3' }, [
        col(quickCard('Ventas realizadas', 'bi-receipt', '#/admin/ventas')),
        col(quickCard('Clientes', 'bi-person-vcard', '#/admin/clientes')),
        col(quickCard('Estadísticas de facturación', 'bi-bar-chart-line', '#/admin/estadisticas-facturacion')),
      ]));
    }

    if (envioCorreosOn) {
      content.append(h('h5', { class: 'fw-semibold mb-3 mt-2' }, 'Envío de correos'));
      content.append(h('div', { class: 'row g-3' }, [
        col(quickCard('Contactos', 'bi-person-lines-fill', '#/admin/correos-contactos')),
        col(quickCard('Enviar quincena', 'bi-envelope-paper', '#/admin/correos-enviar')),
        col(quickCard('Historial de envíos', 'bi-clock-history', '#/admin/correos-historial')),
      ]));
    }
  } catch (err) {
    loading.remove();
    content.append(h('div', { class: 'alert alert-danger' }, `No se pudieron cargar los datos: ${err.message}`));
  }
}

const col = (child) => h('div', { class: 'col-12 col-sm-6 col-lg-3' }, child);
// La fila de estadisticas tiene 5 tarjetas: columnas de ancho automatico en pantallas grandes.
const colStat = (child) => h('div', { class: 'col-12 col-sm-6 col-lg' }, child);

const clickable = (card, href) => h('div', {
  class: 'h-100', style: { cursor: 'pointer' }, onClick: () => router.navigate(href),
}, card);
