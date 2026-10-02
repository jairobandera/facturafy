// Acciones compartidas sobre conteos (usadas por la seccion de conteos y la de finalizados).
import { api } from '../../core/api.js';
import { ui } from '../../core/ui.js';
import { router } from '../../core/router.js';

/**
 * Reabre un conteo finalizado: lo vuelve a marcar como activo y navega a su vista
 * para reajustar cantidades. Al finalizarlo de nuevo, el reporte se regenera solo.
 * @returns {Promise<boolean>} true si se reabrió, false si se canceló o falló.
 */
export async function reabrirConteo(conteo) {
  const ok = await ui.confirm(
    `¿Reabrir el conteo #${conteo.id}? Volverá a estar activo para reajustar cantidades. ` +
    `Al finalizarlo nuevamente se regenerará su reporte.`,
    { confirmText: 'Sí, reabrir', danger: false }
  );
  if (!ok) return false;

  ui.loading('Reabriendo conteo...');
  try {
    await api.put(`/conteos/${conteo.id}`, { conteoFinalizado: false });
    ui.close();
    const target = conteo.tipoConteo === 'CATEGORIAS'
      ? `#/admin/gestionar-conteos/unirse-conteo-categorias/${conteo.id}`
      : `#/admin/gestionar-conteos/unirse-conteo-libre/${conteo.id}`;
    router.navigate(target);
    return true;
  } catch (err) {
    ui.close();
    ui.error(err.message);
    return false;
  }
}
