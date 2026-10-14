// Bloque reutilizable de respaldo/restauracion de la base de datos completa.
// Descarga un JSON con la fecha del dia y permite recuperarlo (reemplaza TODO).
import { h } from '../core/dom.js';
import { api } from '../core/api.js';
import { ui } from '../core/ui.js';

const Swal = window.Swal;

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function descargar() {
  ui.loading('Generando respaldo...');
  try {
    const dump = await api.get('/respaldo');
    const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `stockify-respaldo-${hoyISO()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    ui.close();
    ui.success(`Respaldo descargado (${Object.keys(dump.tablas || {}).length} tablas).`);
  } catch (err) { ui.close(); ui.error(err.message); }
}

function elegirJson() {
  return new Promise((resolve, reject) => {
    const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (e) => { try { resolve(JSON.parse(e.target.result)); } catch { reject(new Error('El archivo no es un respaldo válido (.json).')); } };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsText(file);
    });
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 1000);
  });
}

async function restaurar() {
  let dump;
  try { dump = await elegirJson(); } catch (err) { ui.error(err.message); return; }
  if (!dump) return;
  if (!dump.tablas || typeof dump.tablas !== 'object') { ui.error('El archivo no parece un respaldo de Stockify.'); return; }

  const nTablas = Object.keys(dump.tablas).length;
  const fecha = dump.fecha ? String(dump.fecha).slice(0, 10) : 'desconocida';
  const r = await Swal.fire({
    icon: 'warning',
    title: '¿Restaurar respaldo?',
    html: `<p class="mb-2">Vas a <b>reemplazar TODOS los datos actuales</b> por los del respaldo del <b>${fecha}</b> (${nTablas} tablas).<br>Esto <b>no se puede deshacer</b>.</p>`
      + '<p class="small text-muted mb-0">Escribí <b>RESTAURAR</b> para confirmar.</p>',
    input: 'text',
    inputPlaceholder: 'RESTAURAR',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'Restaurar',
    cancelButtonText: 'Cancelar',
  });
  if (!r.isConfirmed || String(r.value || '').trim().toUpperCase() !== 'RESTAURAR') return;

  ui.loading('Restaurando base de datos...');
  try {
    const res = await api.post('/respaldo/restaurar', dump);
    ui.close();
    ui.success(`Restauración completa: ${res.tablas} tablas (${res.filas} filas).`);
  } catch (err) { ui.close(); ui.error(err.message); }
}

export function bloqueRespaldo() {
  const btnDesc = h('button', { class: 'btn btn-primary' }, [h('i', { class: 'bi bi-download me-1' }), 'Respaldar base de datos']);
  btnDesc.addEventListener('click', descargar);
  const btnRest = h('button', { class: 'btn btn-outline-danger' }, [h('i', { class: 'bi bi-upload me-1' }), 'Restaurar desde respaldo']);
  btnRest.addEventListener('click', restaurar);

  return h('div', { class: 'sk-card p-4 mb-3' }, [
    h('h6', { class: 'mb-1' }, 'Respaldo de la base de datos'),
    h('p', { class: 'text-muted small mb-2' },
      'Descargá una copia completa de todos los datos (se guarda con la fecha del día). '
      + 'Para recuperar, subí ese archivo: reemplaza TODOS los datos actuales por los del respaldo.'),
    h('div', { class: 'd-flex flex-wrap gap-2' }, [btnDesc, btnRest]),
  ]);
}
