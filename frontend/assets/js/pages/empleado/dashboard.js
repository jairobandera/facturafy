import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { router } from '../../core/router.js';
import { ws } from '../../core/ws.js';
import { renderShell } from '../../core/layout.js';
import { onCleanup } from '../../core/lifecycle.js';
import { pageHeader, spinner, badge } from '../../components/page.js';
import { fmt } from '../../core/ui.js';
import { auth } from '../../core/auth.js';
import { resolvePerfil } from '../shared/session.js';
import { sucursalesDeMiEmpresa, esMiSucursal, nombreSucursal } from '../../core/sucursal.js';

export async function empleadoDashboard() {
  const content = renderShell('Dashboard');
  content.append(pageHeader('Conteos disponibles', 'Unite a un conteo activo para registrar el stock.', [
    h('span', { class: 'sk-conteo-live d-flex align-items-center gap-2 text-muted' }, [
      h('span', { class: 'sk-dot on', id: 'ws-dot' }), 'En vivo',
    ]),
  ]));

  const listWrap = h('div', { class: 'row g-3' });
  content.append(listWrap);

  /**
   * Conteos a los que este empleado puede entrar: los de su sucursal y, si el
   * superadmin le habilitó "cuenta en cualquier sucursal", los del resto de su empresa.
   */
  async function conteosVisibles() {
    const mia = auth.getSucursalId();
    const perfil = await resolvePerfil().catch(() => null);
    if (!perfil?.cuentaEnCualquierSucursal) return api.get(`/conteos?sucursalId=${mia}`);
    const sucursales = await sucursalesDeMiEmpresa();
    const listas = await Promise.all(sucursales.map((s) => api.get(`/conteos?sucursalId=${s.id}`)));
    return listas.flat();
  }

  async function load() {
    clear(listWrap);
    const loading = spinner('Cargando conteos...');
    listWrap.append(loading);
    try {
      const conteos = await conteosVisibles();
      clear(listWrap);
      if (conteos.length === 0) {
        listWrap.append(h('div', { class: 'col-12' }, [
          h('div', { class: 'sk-card p-5 text-center text-muted' }, [
            h('i', { class: 'bi bi-clipboard-x', style: { fontSize: '2.5rem' } }),
            h('p', { class: 'mt-2 mb-0' }, 'No hay conteos activos en este momento.'),
          ]),
        ]));
        return;
      }
      for (const c of conteos) listWrap.append(conteoCard(c));
    } catch (err) {
      clear(listWrap);
      listWrap.append(h('div', { class: 'col-12' }, [
        h('div', { class: 'alert alert-danger' }, `Error al cargar: ${err.message}`),
      ]));
    }
  }

  function conteoCard(c) {
    const tipo = c.tipoConteo === 'CATEGORIAS' ? 'Por categorías' : 'Libre';
    const target = c.tipoConteo === 'CATEGORIAS'
      ? `#/empleado/conteo-categorias/${c.id}`
      : `#/empleado/conteo-libre/${c.id}`;
    return h('div', { class: 'col-12 col-md-6 col-lg-4' }, [
      h('div', { class: 'sk-card sk-dash-card p-4 h-100', onClick: () => router.navigate(target) }, [
        h('div', { class: 'd-flex justify-content-between align-items-start' }, [
          h('div', { class: 'sk-stat-icon', style: { background: '#16a34a', width: '46px', height: '46px' } },
            [h('i', { class: 'bi bi-clipboard-check' })]),
          badge(tipo, c.tipoConteo === 'CATEGORIAS' ? 'info' : 'primary'),
        ]),
        h('h5', { class: 'mt-3 mb-1' }, `Conteo #${c.id}`),
        // Si es de otra sucursal se aclara cual, para no confundir conteos parecidos.
        c.sucursalId && !esMiSucursal(c.sucursalId)
          ? h('div', { class: 'mb-1' },
            [h('span', { class: 'badge text-bg-warning' },
              [h('i', { class: 'bi bi-shop me-1' }), nombreSucursal(c.sucursalId)])])
          : null,
        h('p', { class: 'text-muted small mb-0' }, `Iniciado: ${fmt.dateTime(c.fechaHora)}`),
      ]),
    ]);
  }

  load();

  // Actualizacion en vivo: cuando se crea o finaliza un conteo, recargamos la lista.
  const dot = () => document.getElementById('ws-dot');
  const unsub1 = ws.subscribe('conteo-activo', load);
  const unsub2 = ws.subscribe('conteo-finalizado', load);
  const statusTimer = setInterval(() => {
    const d = dot();
    if (d) d.className = 'sk-dot ' + (ws.isConnected() ? 'on' : 'off');
  }, 1500);
  onCleanup(() => { unsub1(); unsub2(); clearInterval(statusTimer); });
}
