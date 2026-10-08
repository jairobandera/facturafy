// Enviar la quincena (paquete "Solo envío de correos"): se sube un Excel con el estado
// de cuenta (una fila por ítem, varias por cliente), se agrupa por clave, se cruza con
// los contactos y se manda a cada uno su estado de cuenta por email.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, badge } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { sucursalSelect } from '../../components/sucursalSelect.js';
import {
  importFromExcelRaw, findHeaderRow, claveCodigo, parsePrecio, excelButton,
} from '../../components/excel.js';
import { descargarPlantilla } from '../../components/plantillas.js';
import { resolveUsuarioId } from '../shared/session.js';

const ALIAS = {
  clave: ['clave', 'rut', 'codigo', 'cedula', 'documento', 'id'],
  concepto: ['concepto', 'detalle', 'descripcion', 'factura', 'comprobante'],
  fecha: ['fecha', 'vencimiento', 'date'],
  monto: ['monto', 'importe', 'saldo', 'total', 'monto_a_pagar', 'montoapagar'],
};

function quincenaActual() {
  const hoy = new Date();
  const y = hoy.getFullYear(); const m = hoy.getMonth();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (hoy.getDate() <= 15) return { desde: iso(new Date(y, m, 1)), hasta: iso(new Date(y, m, 15)) };
  return { desde: iso(new Date(y, m, 16)), hasta: iso(new Date(y, m + 1, 0)) };
}

export function correosEnviarPage() {
  const content = renderShell('Enviar quincena');
  content.append(pageHeader('Enviar quincena', 'Subí el Excel con el estado de cuenta y mandá el correo a cada cliente.'));

  content.append(h('div', { class: 'sk-card p-3 mb-3' }, [
    sucursalSelect(() => resetear()),
    h('div', { class: 'd-flex flex-wrap gap-2 mt-2' }, [
      excelButton('Descargar plantilla', 'bi-file-earmark-excel', () => descargarPlantilla('correosEstadoCuenta'), 'btn-outline-secondary'),
      excelButton('Importar estado de cuenta', 'bi-upload', importar),
    ]),
  ]));

  const panel = h('div');
  content.append(panel);

  let estados = [];        // [{ clave, lineas:[{concepto,fecha,monto}], total }]
  let contactos = new Map(); // claveCodigo -> { nombre, email }

  function resetear() { estados = []; clear(panel); }

  async function importar() {
    let matriz;
    try { matriz = await importFromExcelRaw(); } catch (err) { ui.error(`No se pudo leer el Excel: ${err.message}`); return; }
    if (!matriz || !matriz.length) return;
    const header = findHeaderRow(matriz, ALIAS, ['clave', 'monto']);
    if (!header) { ui.error('No se reconocieron las columnas. Usá la plantilla (Clave, Concepto, Fecha, Monto).'); return; }
    const { index, cols } = header;
    const cell = (row, f) => (cols[f] !== undefined ? row[cols[f]] : null);

    const grupos = new Map();
    for (let i = index + 1; i < matriz.length; i++) {
      const row = matriz[i] || [];
      const clave = claveCodigo(cell(row, 'clave'));
      if (!clave) continue;
      const monto = parsePrecio(cell(row, 'monto'));
      const concepto = String(cell(row, 'concepto') ?? '').trim() || 'Saldo';
      const fecha = cell(row, 'fecha') != null ? String(cell(row, 'fecha')).trim() : '';
      if (!grupos.has(clave)) grupos.set(clave, { clave, lineas: [], total: 0 });
      const g = grupos.get(clave);
      g.lineas.push({ concepto, fecha, monto });
      g.total += monto;
    }
    estados = [...grupos.values()];
    if (!estados.length) { ui.error('No se encontraron filas válidas (revisá Clave y Monto).'); return; }

    ui.loading('Cargando contactos...');
    try {
      const lista = await api.get(`/envio-correos/contactos/sucursal/${sucursalActiva()}`);
      contactos = new Map(lista.map((c) => [claveCodigo(c.clave), c]));
      ui.close();
    } catch (err) { ui.close(); ui.error(err.message); return; }

    render();
  }

  function render() {
    clear(panel);
    const { desde, hasta } = quincenaActual();
    const asunto = h('input', { class: 'form-control', value: 'Estado de cuenta' });
    const mensaje = h('textarea', { class: 'form-control', rows: 2 },
      'Le enviamos el detalle de su estado de cuenta y el saldo a pagar.');
    const desdeI = h('input', { class: 'form-control', type: 'date', value: desde });
    const hastaI = h('input', { class: 'form-control', type: 'date', value: hasta });

    const rows = estados.map((e) => {
      const c = contactos.get(e.clave);
      return { clave: e.clave, nombre: c?.nombre || '(sin contacto)', email: c?.email || '-', items: e.lineas.length, total: e.total, ok: !!(c && c.email) };
    });
    const sinContacto = rows.filter((r) => !r.ok).length;
    const totalGeneral = rows.reduce((a, r) => a + r.total, 0);

    const enviarBtn = h('button', { class: 'btn btn-success btn-lg' },
      [h('i', { class: 'bi bi-send me-1' }), `Enviar a ${rows.length - sinContacto} cliente(s)`]);
    enviarBtn.addEventListener('click', () => enviar({ asunto: asunto.value, mensaje: mensaje.value, desde: desdeI.value, hasta: hastaI.value }));

    panel.append(
      h('div', { class: 'sk-card p-3 mb-3' }, [
        h('div', { class: 'row g-3' }, [
          h('div', { class: 'col-md-6' }, [h('label', { class: 'form-label small mb-1' }, 'Asunto'), asunto]),
          h('div', { class: 'col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Desde'), desdeI]),
          h('div', { class: 'col-md-3' }, [h('label', { class: 'form-label small mb-1' }, 'Hasta'), hastaI]),
          h('div', { class: 'col-12' }, [h('label', { class: 'form-label small mb-1' }, 'Mensaje (podés usar {nombre} y {total})'), mensaje]),
        ]),
      ]),
      sinContacto
        ? h('div', { class: 'alert alert-warning py-2' }, `${sinContacto} cliente(s) del Excel no tienen contacto/email cargado: no se les enviará. Cargalos en Contactos.`)
        : null,
      dataTable({
        columns: [
          { key: 'clave', label: 'Clave' },
          { key: 'nombre', label: 'Nombre' },
          { key: 'email', label: 'Email' },
          { key: 'items', label: 'Ítems', className: 'text-center' },
          { key: 'total', label: 'Total', className: 'text-end', render: (r) => fmt.money(r.total) },
          { key: 'ok', label: 'Estado', render: (r) => r.ok ? badge('Listo', 'success') : badge('Sin contacto', 'warning') },
        ],
        rows,
        searchKeys: ['clave', 'nombre', 'email'],
        rowClass: (r) => r.ok ? '' : 'text-muted',
      }),
      h('div', { class: 'd-flex justify-content-between align-items-center mt-3' }, [
        h('div', { class: 'fw-semibold' }, `Total general: ${fmt.money(totalGeneral)}`),
        enviarBtn,
      ]),
    );
  }

  async function enviar({ asunto, mensaje, desde, hasta }) {
    const ok = await ui.confirm('Se enviará el estado de cuenta por email a cada cliente con contacto. ¿Confirmás?',
      { title: 'Enviar quincena', confirmText: 'Enviar', danger: false });
    if (!ok) return;
    ui.loading('Enviando correos...');
    try {
      const usuarioId = await resolveUsuarioId().catch(() => null);
      const r = await api.post(`/envio-correos/enviar/sucursal/${sucursalActiva()}`, {
        asunto, mensaje, desde, hasta, usuarioId, estados,
      });
      ui.close();
      ui.info('Envío de quincena',
        `Enviados: ${r.enviados} · Fallidos: ${r.fallidos} · Sin contacto: ${r.sinContacto}`);
      resetear();
    } catch (err) { ui.close(); ui.error(err.message); }
  }
}
