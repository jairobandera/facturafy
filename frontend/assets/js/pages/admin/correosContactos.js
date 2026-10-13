// Contactos del paquete "Solo envío de correos": lista reutilizable de clientes
// (clave/nombre/email) que se carga desde Excel (merge) y se usa para enviar la
// quincena. No tiene relación con los clientes de facturación.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, primaryButton } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';
import { sucursalActiva, sucursalActual } from '../../core/sucursal.js';
import { sucursalSelect } from '../../components/sucursalSelect.js';
import {
  importFromExcelRaw, findHeaderRow, claveCodigo, excelButton,
} from '../../components/excel.js';
import { mapeoColumnas, aplicarMapeo } from '../../components/mapeoColumnas.js';
import { descargarPlantilla } from '../../components/plantillas.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALIAS = {
  clave: ['clave', 'rut', 'codigo', 'cedula', 'documento', 'id'],
  nombre: ['nombre', 'razonsocial', 'razon_social', 'cliente', 'nombre_cliente'],
  email: ['email', 'correo', 'mail', 'e-mail'],
  direccion: ['direccion', 'domicilio', 'dir'],
};
// Para listados sin encabezado (ej. mezcla empresas/personas): los campos son compuestos
// (ej. nombre = razón social O nombre+apellido) y se puede filtrar por una columna Tipo.
const CAMPOS_CONTACTO = [
  { campo: 'nombre', label: 'Nombre (razón social o nombre+apellido)', requerido: true, compuesto: true },
  { campo: 'clave', label: 'Clave (RUT / CI / cuenta / código)', requerido: true, compuesto: true },
  { campo: 'email', label: 'Email', requerido: true, compuesto: true },
  { campo: 'direccion', label: 'Dirección', requerido: false, compuesto: true },
];

export function correosContactosPage() {
  const content = renderShell('Clientes');
  content.append(pageHeader('Clientes (envío de correos)',
    'Lista de clientes a los que mandás el estado de cuenta. Cargala desde Excel.'));

  content.append(h('div', { class: 'sk-card p-3 mb-3' }, [
    sucursalSelect(() => load()),
    h('div', { class: 'd-flex flex-wrap gap-2 mt-2' }, [
      excelButton('Descargar plantilla', 'bi-file-earmark-excel', () => descargarPlantilla('correosContactos'), 'btn-outline-secondary'),
      excelButton('Importar Excel', 'bi-upload', importar),
      primaryButton('Actualizar', 'bi-arrow-clockwise', () => load()),
    ]),
  ]));

  const tableWrap = h('div');
  content.append(tableWrap);

  async function importar() {
    let matriz;
    try { matriz = await importFromExcelRaw(); } catch (err) { ui.error(`No se pudo leer el Excel: ${err.message}`); return; }
    if (!matriz || !matriz.length) return;
    // Con encabezado reconocible, como siempre; si no, asistente de mapeo (con perfiles).
    let filas = null;
    // Deteccion EXACTA: estos listados no tienen encabezado y un dato cualquiera
    // ("RUTA 3 KM 371") disparaba un falso positivo. La plantilla (Clave/Nombre/Email)
    // si matchea exacto; el resto cae al asistente.
    const header = findHeaderRow(matriz, ALIAS, ['clave', 'email'], 20, true);
    if (header) {
      const { index, cols } = header;
      const cell = (row, f) => (cols[f] !== undefined ? row[cols[f]] : null);
      filas = [];
      for (let i = index + 1; i < matriz.length; i++) {
        const row = matriz[i] || [];
        filas.push({ clave: cell(row, 'clave'), email: cell(row, 'email'), nombre: cell(row, 'nombre'), direccion: cell(row, 'direccion') });
      }
    } else {
      const map = await mapeoColumnas({ matriz, campos: CAMPOS_CONTACTO, empresaId: sucursalActual()?.empresaId, tipo: 'contactos', conFiltro: true });
      if (!map) return;
      filas = aplicarMapeo(matriz, map);
    }

    const items = [];
    let invalidos = 0;
    for (const f of filas) {
      const clave = claveCodigo(f.clave);
      const email = String(f.email ?? '').trim();
      const nombre = String(f.nombre ?? '').trim() || null;
      const direccion = String(f.direccion ?? '').trim() || null;
      if (!clave && !email) continue;               // fila vacía
      if (!clave || !EMAIL_RE.test(email)) { invalidos++; continue; }
      items.push({ clave, nombre, email, direccion });
    }
    if (!items.length) { ui.error('No se encontraron contactos válidos (revisá Clave y Email).'); return; }

    const ok = await ui.confirm(
      `Se importarán ${items.length} contacto(s)${invalidos ? ` (${invalidos} fila(s) inválida(s) se omiten)` : ''}. ` +
      'Los que ya existan (misma clave) se actualizan.',
      { title: 'Importar contactos', confirmText: 'Importar', danger: false });
    if (!ok) return;

    ui.loading('Importando...');
    try {
      const r = await api.post(`/envio-correos/contactos/sucursal/${sucursalActiva()}`, { items });
      ui.close();
      ui.info('Importación', `Agregados: ${r.agregados} · Actualizados: ${r.actualizados} · Inválidos: ${r.invalidos}`);
      await load();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  async function borrar(c) {
    const ok = await ui.confirm(`¿Quitar a "${c.nombre || c.clave}" de la lista?`, { confirmText: 'Quitar' });
    if (!ok) return;
    ui.loading('Quitando...');
    try { await api.del(`/envio-correos/contactos/${c.id}`); ui.close(); await load(); }
    catch (err) { ui.close(); ui.error(err.message); }
  }

  async function load() {
    clear(tableWrap);
    const sp = spinner('Cargando contactos...');
    tableWrap.append(sp);
    try {
      const rows = await api.get(`/envio-correos/contactos/sucursal/${sucursalActiva()}`);
      clear(tableWrap);
      if (!rows.length) {
        tableWrap.append(h('div', { class: 'sk-card p-4 text-center text-muted' },
          'Todavía no hay contactos. Descargá la plantilla, completala e importala.'));
        return;
      }
      tableWrap.append(dataTable({
        columns: [
          { key: 'clave', label: 'Clave' },
          { key: 'nombre', label: 'Nombre', render: (r) => r.nombre || '-' },
          { key: 'email', label: 'Email' },
          { key: 'direccion', label: 'Dirección', render: (r) => r.direccion || '-' },
        ],
        rows,
        searchKeys: ['clave', 'nombre', 'email', 'direccion'],
        actions: [{ icon: 'bi-trash', title: 'Quitar', className: 'btn-outline-danger', onClick: borrar }],
      }));
    } catch (err) {
      clear(tableWrap);
      tableWrap.append(h('div', { class: 'alert alert-danger' }, `Error al cargar: ${err.message}`));
    }
  }

  load();
}
