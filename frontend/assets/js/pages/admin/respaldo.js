// Respaldo (administrador): copia de seguridad y restauracion de toda la base de datos.
// Disponible en cualquier paquete (no depende de stock/facturacion/correos).
import { renderShell } from '../../core/layout.js';
import { pageHeader } from '../../components/page.js';
import { bloqueRespaldo } from '../../components/respaldo.js';

export function respaldoPage() {
  const content = renderShell('Respaldo');
  content.append(pageHeader('Respaldo', 'Copia de seguridad y restauración de todos los datos.'));
  content.append(bloqueRespaldo());
}
