// Estadisticas de facturacion (administrador). Separadas de las de conteos.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { onCleanup } from '../../core/lifecycle.js';
import { pageHeader, primaryButton } from '../../components/page.js';
import { statCard } from '../../components/cards.js';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
let charts = [];

export function estadisticasFacturacion() {
  const content = renderShell('Estadísticas de facturación');
  const sucursalId = sucursalActiva();

  const hoy = new Date();
  const haceSeis = new Date(); haceSeis.setMonth(hoy.getMonth() - 6);
  const desdeInput = h('input', { class: 'form-control', type: 'date', value: iso(haceSeis) });
  const hastaInput = h('input', { class: 'form-control', type: 'date', value: iso(hoy) });
  const anioInput = h('input', { class: 'form-control', type: 'number', value: hoy.getFullYear(), min: 2000, max: 2100 });

  content.append(pageHeader('Estadísticas de facturación', 'Ventas, formas de pago y productos más vendidos.'));

  content.append(h('div', { class: 'sk-card p-3 mb-4' }, [
    h('div', { class: 'row g-3 align-items-end' }, [
      h('div', { class: 'col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Desde'), desdeInput]),
      h('div', { class: 'col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Hasta'), hastaInput]),
      h('div', { class: 'col-md-2' }, [h('label', { class: 'form-label small mb-1' }, 'Año (mensual)'), anioInput]),
      h('div', { class: 'col-md-2' }, [primaryButton('Actualizar', 'bi-arrow-clockwise', () => load())]),
    ]),
  ]));

  const cards = h('div', { class: 'row g-3 mb-4' });
  content.append(cards);

  const grid = h('div', { class: 'row g-4' }, [
    chartCol('Facturación por mes', 'ch-fact-mes', 'col-12'),
    chartCol('Contado vs Crédito', 'ch-pago'),
    chartCol('Productos más vendidos', 'ch-top'),
  ]);
  content.append(grid);

  async function load() {
    destroyCharts();
    const desde = desdeInput.value, hasta = hastaInput.value, anio = anioInput.value;
    if (!desde || !hasta) { ui.error('Seleccioná el rango de fechas.'); return; }
    const qs = `fechaDesde=${desde}&fechaHasta=${hasta}&sucursalId=${sucursalId}`;
    try {
      const [resumen, porMes, top] = await Promise.all([
        api.get(`/estadisticas-venta/resumen?${qs}`),
        api.get(`/estadisticas-venta/facturado-mes?anio=${anio}&sucursalId=${sucursalId}`),
        api.get(`/estadisticas-venta/top-productos?${qs}`),
      ]);

      clear(cards);
      cards.append(
        colCard(statCard('Total facturado', fmt.money(resumen.totalFacturado), 'bi-cash-stack', '#16a34a')),
        colCard(statCard('Ventas emitidas', resumen.ventasEmitidas, 'bi-receipt', '#2563eb')),
        colCard(statCard('Contado', fmt.money(resumen.totalContado), 'bi-coin', '#0891b2')),
        colCard(statCard('Crédito', fmt.money(resumen.totalCredito), 'bi-credit-card', '#f59e0b')),
        colCard(statCard('Anuladas', resumen.ventasAnuladas, 'bi-x-octagon', '#dc2626')),
      );

      lineFacturacion('ch-fact-mes', porMes);
      pieChart('ch-pago', ['Contado', 'Crédito'], [resumen.totalContado, resumen.totalCredito]);
      barChart('ch-top', top.slice(0, 10).map((x) => x.nombreProducto),
        top.slice(0, 10).map((x) => x.cantidadVendida), 'Cantidad vendida', '#7c3aed');
    } catch (err) {
      ui.error(`No se pudieron cargar las estadísticas: ${err.message}`);
    }
  }

  load();
  onCleanup(destroyCharts);
}

const colCard = (child) => h('div', { class: 'col-12 col-sm-6 col-lg' }, child);

function chartCol(title, canvasId, cls = 'col-12 col-lg-6') {
  return h('div', { class: cls }, [
    h('div', { class: 'sk-card p-3 h-100' }, [
      h('h6', { class: 'fw-semibold mb-3' }, title),
      h('div', { style: { position: 'relative', height: '300px' } }, [h('canvas', { id: canvasId })]),
    ]),
  ]);
}

function destroyCharts() { for (const c of charts) { try { c.destroy(); } catch { /* */ } } charts = []; }
function ctx(id) { const el = document.getElementById(id); return el ? el.getContext('2d') : null; }

function barChart(id, labels, data, label, color) {
  const c = ctx(id); if (!c) return;
  charts.push(new Chart(c, {
    type: 'bar',
    data: { labels: labels.length ? labels : ['Sin datos'], datasets: [{ label, data: data.length ? data : [0], backgroundColor: color }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  }));
}

function pieChart(id, labels, data) {
  const c = ctx(id); if (!c) return;
  charts.push(new Chart(c, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: data.some((n) => n > 0) ? data : [1, 0], backgroundColor: ['#0891b2', '#f59e0b'] }] },
    options: { responsive: true, maintainAspectRatio: false },
  }));
}

function lineFacturacion(id, porMes) {
  const c = ctx(id); if (!c) return;
  const map = new Map(porMes.map((x) => [x.mes, x.totalFacturado]));
  const data = MESES.map((_, i) => map.get(i + 1) || 0);
  charts.push(new Chart(c, {
    type: 'bar',
    data: { labels: MESES, datasets: [{ label: 'Facturado ($)', data, backgroundColor: '#16a34a' }] },
    options: { responsive: true, maintainAspectRatio: false },
  }));
}

function iso(d) { return d.toISOString().slice(0, 10); }
