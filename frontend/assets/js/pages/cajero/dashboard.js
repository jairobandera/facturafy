import { h } from '../../core/dom.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader } from '../../components/page.js';
import { quickCard } from '../../components/cards.js';
import { auth } from '../../core/auth.js';

export function cajeroDashboard() {
  const content = renderShell('Facturación');
  const nombre = auth.getUsername();
  content.append(pageHeader(`Hola, ${nombre}`, 'Punto de venta y clientes de tu sucursal.'));

  content.append(h('div', { class: 'row g-3' }, [
    col(quickCard('Punto de venta', 'bi-cart-plus', '#/facturacion/pos')),
    col(quickCard('Clientes', 'bi-person-vcard', '#/facturacion/clientes')),
  ]));
}

const col = (child) => h('div', { class: 'col-12 col-sm-6 col-lg-4' }, child);
