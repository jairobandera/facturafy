// Cierre de turno (arqueo de caja). Muestra el resumen del turno abierto (ventas por
// forma de pago, anuladas, participantes) para que el cajero haga el arqueo, y permite
// cerrarlo. Cerrar lo puede hacer el responsable del turno o un administrador.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { router } from '../../core/router.js';
import { pageHeader, spinner, badge } from '../../components/page.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { cargarTurnoActivo, soyMiembro, soyResponsable } from '../../core/turno.js';
import { resolveUsuarioId } from '../shared/session.js';
import { tarjetaArqueo, arqueoPDF } from '../shared/arqueo.js';

const Swal = window.Swal;

export async function cerrarTurnoPage() {
  const content = renderShell('Cerrar turno');
  const sucursalId = sucursalActiva();

  const loading = spinner('Cargando turno...');
  content.append(loading);

  let usuarioId = null;
  let turno = null;
  try {
    [usuarioId, turno] = await Promise.all([resolveUsuarioId(), cargarTurnoActivo(sucursalId)]);
  } catch (err) {
    loading.remove();
    content.append(h('div', { class: 'alert alert-danger' }, `No se pudo cargar: ${err.message}`));
    return;
  }

  if (!turno || !soyMiembro(turno, usuarioId)) {
    loading.remove();
    ui.info('Turno no iniciado', 'Tenés que iniciar o unirte a un turno de caja.');
    router.navigate('/facturacion/dashboard');
    return;
  }

  let reporte;
  try { reporte = await api.get(`/turnos/${turno.id}/reporte`); }
  catch (err) { loading.remove(); content.append(h('div', { class: 'alert alert-danger' }, err.message)); return; }
  loading.remove();

  const puedeCerrar = soyResponsable(turno, usuarioId);

  content.append(pageHeader('Cerrar turno', `Turno ${turno.numeroLabel} · desde ${fmt.dateTime(turno.fechaApertura)}`));

  const wrap = h('div');
  content.append(wrap);
  wrap.append(tarjetaArqueo(reporte, 'Resumen del turno (abierto)'));

  if (puedeCerrar) {
    const btn = h('button', { class: 'btn btn-danger btn-lg' }, [h('i', { class: 'bi bi-door-closed me-1' }), 'Cerrar turno ahora']);
    btn.addEventListener('click', cerrar);
    wrap.append(h('div', { class: 'mt-3 d-flex justify-content-end' }, btn));
  } else {
    wrap.append(h('div', { class: 'alert alert-info mt-3' },
      'Solo el cajero responsable del turno o un administrador pueden cerrarlo. Podés ver el resumen para el arqueo.'));
  }

  async function cerrar() {
    const { value: observaciones, isConfirmed } = await Swal.fire({
      title: '¿Cerrar el turno?',
      html: '<p class="small text-muted mb-2">Al cerrar, el turno deja de recibir ventas y se genera el reporte de arqueo.</p>',
      input: 'textarea', inputPlaceholder: 'Observaciones del cierre (opcional)...',
      showCancelButton: true, confirmButtonText: 'Sí, cerrar turno', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626', cancelButtonColor: '#64748b',
    });
    if (!isConfirmed) return;
    ui.loading('Cerrando turno...');
    try {
      const final = await api.post(`/turnos/${turno.id}/cerrar`, { usuarioId, observaciones: observaciones || null });
      ui.close();
      clear(wrap);
      wrap.append(
        h('div', { class: 'alert alert-success d-flex align-items-center gap-2' }, [
          h('i', { class: 'bi bi-check-circle-fill' }),
          h('div', {}, `Turno ${final.turno.numeroLabel} cerrado. ${fmt.dateTime(final.turno.fechaCierre)}`),
        ]),
        tarjetaArqueo(final, 'Reporte de arqueo (cierre)'),
        h('div', { class: 'mt-3 d-flex justify-content-end gap-2' }, [
          h('button', { class: 'btn btn-outline-primary', onClick: () => arqueoPDF(final) },
            [h('i', { class: 'bi bi-filetype-pdf me-1' }), 'Descargar reporte']),
          h('button', { class: 'btn btn-primary', onClick: () => router.navigate('/facturacion/dashboard') },
            [h('i', { class: 'bi bi-house me-1' }), 'Volver al inicio']),
        ]),
      );
    } catch (err) { ui.close(); ui.error(err.message); }
  }
}
