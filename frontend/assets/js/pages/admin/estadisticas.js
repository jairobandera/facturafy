import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { ui } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { onCleanup } from '../../core/lifecycle.js';
import { pageHeader, primaryButton } from '../../components/page.js';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
let charts = [];

export function estadisticas() {
  const content = renderShell('Estadísticas');
  const sucursalId = sucursalActiva();

  const hoy = new Date();
  const haceUnMes = new Date(); haceUnMes.setMonth(hoy.getMonth() - 6);
  const desdeInput = h('input', { class: 'form-control', type: 'date', value: iso(haceUnMes) });
  const hastaInput = h('input', { class: 'form-control', type: 'date', value: iso(hoy) });
  const anioInput = h('input', { class: 'form-control', type: 'number', value: hoy.getFullYear(), min: 2000, max: 2100 });

  content.append(pageHeader('Estadísticas de conteos', 'Análisis de faltantes y sobrantes de tu sucursal.'));

  content.append(h('div', { class: 'sk-card p-3 mb-4' }, [
    h('div', { class: 'row g-3 align-items-end' }, [
      h('div', { class: 'col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Desde'), desdeInput]),
      h('div', { class: 'col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Hasta'), hastaInput]),
      h('div', { class: 'col-md-2' }, [h('label', { class: 'form-label small mb-1' }, 'Año (dinero)'), anioInput]),
      h('div', { class: 'col-md-2' }, [primaryButton('Actualizar', 'bi-arrow-clockwise', () => load())]),
    ]),
  ]));

  const grid = h('div', { class: 'row g-4' }, [
    chartCol('Productos con mayor faltante', 'ch-prod-falt'),
    chartCol('Productos con mayor sobrante', 'ch-prod-sob'),
    chartCol('Categorías con mayor faltante', 'ch-cat-falt'),
    chartCol('Categorías con mayor sobrante', 'ch-cat-sob'),
    chartCol('Dinero faltante por mes', 'ch-dinero', 'col-12'),
  ]);
  content.append(grid);

  async function load() {
    destroyCharts();
    const desde = desdeInput.value, hasta = hastaInput.value, anio = anioInput.value;
    if (!desde || !hasta) { ui.error('Selecciona el rango de fechas.'); return; }
    const qs = `fechaDesde=${desde}&fechaHasta=${hasta}&sucursalId=${sucursalId}`;
    try {
      const [pf, ps, cf, cs, df, ds] = await Promise.all([
        api.get(`/estadisticas/productos-faltaron?${qs}`),
        api.get(`/estadisticas/productos-sobrantes?${qs}`),
        api.get(`/estadisticas/categorias-faltantes?${qs}`),
        api.get(`/estadisticas/categorias-sobrantes?${qs}`),
        api.get(`/estadisticas/dinero-faltante-mes?anio=${anio}&sucursalId=${sucursalId}`),
        api.get(`/estadisticas/dinero-sobrante-mes?anio=${anio}&sucursalId=${sucursalId}`),
      ]);

      barChart('ch-prod-falt', pf.slice(0, 10).map((x) => x.nombreProducto), pf.slice(0, 10).map((x) => x.cantidadFaltante), 'Faltante', '#dc2626');
      barChart('ch-prod-sob', ps.slice(0, 10).map((x) => x.nombreProducto), ps.slice(0, 10).map((x) => x.cantidadSobrante), 'Sobrante', '#2563eb');
      pieChart('ch-cat-falt', cf.map((x) => x.nombreCategoria), cf.map((x) => x.cantidadFaltante));
      pieChart('ch-cat-sob', cs.map((x) => x.nombreCategoria), cs.map((x) => x.cantidadSobrante));
      dineroChart('ch-dinero', df, ds);
    } catch (err) {
      ui.error(`No se pudieron cargar las estadísticas: ${err.message}`);
    }
  }

  load();
  onCleanup(destroyCharts);
}

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
  const palette = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
  charts.push(new Chart(c, {
    type: 'doughnut',
    data: { labels: labels.length ? labels : ['Sin datos'], datasets: [{ data: data.length ? data : [1], backgroundColor: palette }] },
    options: { responsive: true, maintainAspectRatio: false },
  }));
}

function dineroChart(id, faltante, sobrante) {
  const c = ctx(id); if (!c) return;
  const fMap = new Map(faltante.map((x) => [x.mes, x.totalFaltante]));
  const sMap = new Map(sobrante.map((x) => [x.mes, x.totalSobrante]));
  const labels = MESES;
  const dataF = MESES.map((_, i) => fMap.get(i + 1) || 0);
  const dataS = MESES.map((_, i) => sMap.get(i + 1) || 0);
  charts.push(new Chart(c, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Faltante ($)', data: dataF, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.1)', tension: .3, fill: true },
        { label: 'Sobrante ($)', data: dataS, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.1)', tension: .3, fill: true },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  }));
}

function iso(d) { return d.toISOString().slice(0, 10); }
