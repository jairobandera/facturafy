// Tarjeta y PDF del arqueo de un turno. Lo comparten el cierre del cajero y la vista
// de turnos del administrador.
import { h } from '../../core/dom.js';
import { fmt } from '../../core/ui.js';
import { badge } from '../../components/page.js';

function fila(label, cantidad, total, { fuerte } = {}) {
  return h('div', { class: `d-flex justify-content-between py-1 ${fuerte ? 'fw-bold border-top pt-2' : ''}` }, [
    h('span', {}, [label, cantidad != null ? h('span', { class: 'text-muted small ms-2' }, `(${cantidad})`) : null]),
    h('span', {}, fmt.money(total)),
  ]);
}

export function tarjetaArqueo({ turno, resumen }, titulo) {
  const responsable = (turno.participantes || []).find((p) => p.esResponsable);
  const participantes = (turno.participantes || []).map((p) =>
    h('span', { class: 'badge text-bg-light border me-1 mb-1' }, [
      `${p.nombre || ''} ${p.apellido || ''}`.trim() || p.nombreUsuario,
      p.esResponsable ? h('i', { class: 'bi bi-star-fill text-warning ms-1' }) : null,
    ]));
  return h('div', { class: 'sk-card p-4' }, [
    h('div', { class: 'd-flex justify-content-between align-items-center mb-3' }, [
      h('h5', { class: 'mb-0' }, titulo),
      badge(turno.estado === 'CERRADO' ? 'Cerrado' : 'Abierto', turno.estado === 'CERRADO' ? 'secondary' : 'success'),
    ]),
    h('div', { class: 'row g-3' }, [
      h('div', { class: 'col-md-6' }, [
        fila('Ventas al contado', resumen.contado.cantidad, resumen.contado.total),
        fila('Ventas a crédito', resumen.credito.cantidad, resumen.credito.total),
        fila('Total vendido', resumen.cantidadVentas, resumen.totalVendido, { fuerte: true }),
        h('div', { class: 'd-flex justify-content-between py-1 text-danger' }, [
          h('span', {}, ['Anuladas', h('span', { class: 'small ms-2' }, `(${resumen.anuladas.cantidad})`)]),
          h('span', {}, fmt.money(resumen.anuladas.total)),
        ]),
      ]),
      h('div', { class: 'col-md-6' }, [
        h('div', { class: 'small text-muted' }, 'Turno'),
        h('div', { class: 'mb-2' }, turno.numeroLabel),
        h('div', { class: 'small text-muted' }, 'Responsable'),
        h('div', { class: 'mb-2' }, responsable ? `${responsable.nombre || ''} ${responsable.apellido || ''}`.trim() || responsable.nombreUsuario : 'Sin responsable'),
        h('div', { class: 'small text-muted' }, 'Cajeros del turno'),
        h('div', {}, participantes),
      ]),
    ]),
    h('div', { class: 'text-muted small mt-3' }, [
      `Apertura: ${fmt.dateTime(turno.fechaApertura)}`,
      turno.fechaCierre ? ` · Cierre: ${fmt.dateTime(turno.fechaCierre)}` : '',
    ]),
  ]);
}

/** Reporte de arqueo en PDF (jsPDF, ya cargado por CDN). */
export function arqueoPDF({ turno, resumen }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text('Facturafy - Reporte de arqueo de turno', 14, 18);
  doc.setFontSize(10);
  let y = 28;
  const linea = (t) => { doc.text(t, 14, y); y += 6; };
  linea(`Turno: ${turno.numeroLabel} (#${turno.id})`);
  linea(`Apertura: ${fmt.dateTime(turno.fechaApertura)}`);
  if (turno.fechaCierre) linea(`Cierre: ${fmt.dateTime(turno.fechaCierre)}`);
  const resp = (turno.participantes || []).find((p) => p.esResponsable);
  linea(`Responsable: ${resp ? `${resp.nombre || ''} ${resp.apellido || ''}`.trim() || resp.nombreUsuario : 'Sin responsable'}`);
  y += 2;
  doc.setFontSize(12); linea('Resumen'); doc.setFontSize(10);
  linea(`Ventas al contado: ${resumen.contado.cantidad}  -  ${fmt.money(resumen.contado.total)}`);
  linea(`Ventas a credito:  ${resumen.credito.cantidad}  -  ${fmt.money(resumen.credito.total)}`);
  linea(`Total vendido:     ${resumen.cantidadVentas}  -  ${fmt.money(resumen.totalVendido)}`);
  linea(`Anuladas:          ${resumen.anuladas.cantidad}  -  ${fmt.money(resumen.anuladas.total)}`);
  y += 4;
  doc.setFontSize(9);
  doc.text('Cajeros del turno:', 14, y); y += 5;
  for (const p of (turno.participantes || [])) {
    doc.text(`- ${`${p.nombre || ''} ${p.apellido || ''}`.trim() || p.nombreUsuario}${p.esResponsable ? ' (responsable)' : ''}`, 16, y);
    y += 5;
  }
  if (turno.observacionesCierre) { y += 2; doc.text(`Observaciones: ${turno.observacionesCierre}`, 14, y); }
  doc.save(`arqueo-turno-${turno.id}.pdf`);
}
