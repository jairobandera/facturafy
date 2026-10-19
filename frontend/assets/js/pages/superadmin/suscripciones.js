// Suscripciones (superadmin): por empresa, ver el estado, generar claves de activacion
// (un solo uso, con duracion en dias), listarlas/darlas de baja y marcar una empresa como
// ilimitada. La clave se le pasa al administrador de la empresa para que la ingrese.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, badge } from '../../components/page.js';
import { dataTable } from '../../components/dataTable.js';

const DURACIONES = [
  { value: 7, label: '7 días (prueba)' },
  { value: 30, label: '1 mes (30 días)' },
  { value: 90, label: '3 meses (90 días)' },
  { value: 180, label: '6 meses (180 días)' },
  { value: 365, label: '1 año (365 días)' },
];

const ESTADO_BADGE = {
  ILIMITADA: ['Ilimitada', 'primary'],
  VIGENTE: ['Vigente', 'success'],
  PRUEBA: ['En prueba', 'info'],
  VENCIDA: ['Vencida', 'danger'],
};

function estadoEmpresaBadge(est) {
  if (est.ilimitada) return badge(...ESTADO_BADGE.ILIMITADA);
  if (est.bloqueada) return badge(...ESTADO_BADGE.VENCIDA);
  if (est.enPrueba) return badge(...ESTADO_BADGE.PRUEBA);
  return badge(...ESTADO_BADGE.VIGENTE);
}

export async function suscripcionesPage() {
  const content = renderShell('Suscripciones');
  content.append(pageHeader('Suscripciones', 'Generá las claves de activación por empresa y mirá su estado.'));

  const empresaSel = h('select', { class: 'form-select' }, [h('option', { value: '' }, 'Seleccionar empresa...')]);
  content.append(h('div', { class: 'sk-card p-3 mb-3' }, [
    h('label', { class: 'form-label small mb-1' }, 'Empresa'), empresaSel,
  ]));
  const panel = h('div');
  content.append(panel);

  try {
    const empresas = await api.get('/empresas');
    for (const e of empresas) empresaSel.append(h('option', { value: e.id }, e.nombre));
  } catch (err) {
    content.append(h('div', { class: 'alert alert-danger' }, `No se pudieron cargar las empresas: ${err.message}`));
    return;
  }

  empresaSel.addEventListener('change', () => {
    clear(panel);
    if (empresaSel.value) renderEmpresa(panel, Number(empresaSel.value));
  });
}

async function renderEmpresa(panel, empresaId) {
  clear(panel);
  const sp = spinner('Cargando...');
  panel.append(sp);
  let estado, codigos;
  try {
    [estado, codigos] = await Promise.all([
      api.get(`/suscripcion/empresa/${empresaId}/estado`),
      api.get(`/suscripcion/codigos/empresa/${empresaId}`),
    ]);
  } catch (err) { clear(panel); panel.append(h('div', { class: 'alert alert-danger' }, err.message)); return; }
  clear(panel);

  // ---- Estado + ilimitada ----
  const vence = estado.ilimitada ? 'No vence (ilimitada)'
    : estado.bloqueada ? `Venció el ${fmt.date(estado.vigenteHasta)}`
      : `Vigente hasta ${fmt.date(estado.vigenteHasta)} (${estado.diasRestantes} día(s))`;
  const ilimitadaCheck = h('input', { class: 'form-check-input', type: 'checkbox', id: 'sus-ilim', checked: estado.ilimitada });
  ilimitadaCheck.addEventListener('change', async () => {
    ui.loading('Guardando...');
    try { await api.put(`/suscripcion/empresa/${empresaId}`, { ilimitada: ilimitadaCheck.checked }); ui.close(); renderEmpresa(panel, empresaId); }
    catch (err) { ui.close(); ui.error(err.message); ilimitadaCheck.checked = estado.ilimitada; }
  });
  panel.append(h('div', { class: 'sk-card p-4 mb-3' }, [
    h('div', { class: 'd-flex align-items-center gap-2 mb-2' }, [
      h('h6', { class: 'mb-0 me-2' }, estado.nombre || 'Empresa'), estadoEmpresaBadge(estado),
    ]),
    h('p', { class: 'text-muted mb-3' }, vence),
    h('div', { class: 'form-check' }, [
      ilimitadaCheck, h('label', { class: 'form-check-label', for: 'sus-ilim' }, 'Suscripción ilimitada (no vence nunca)'),
    ]),
  ]));

  // ---- Generar clave ----
  const durSel = h('select', { class: 'form-select w-auto' }, DURACIONES.map((d) => h('option', { value: String(d.value) }, d.label)));
  durSel.value = '30';
  const genBtn = h('button', { class: 'btn btn-primary' }, [h('i', { class: 'bi bi-key me-1' }), 'Generar clave']);
  genBtn.addEventListener('click', async () => {
    ui.loading('Generando...');
    try {
      const r = await api.post('/suscripcion/codigos', { empresaId, dias: Number(durSel.value) });
      ui.close();
      await mostrarClave(r.codigo, Number(durSel.value));
      renderEmpresa(panel, empresaId);
    } catch (err) { ui.close(); ui.error(err.message); }
  });
  panel.append(h('div', { class: 'sk-card p-4 mb-3' }, [
    h('h6', { class: 'mb-1' }, 'Generar clave de activación'),
    h('p', { class: 'text-muted small mb-2' }, 'La clave es de un solo uso. Al ingresarla, la empresa suma esa cantidad de días.'),
    h('div', { class: 'd-flex flex-wrap gap-2 align-items-center' }, [durSel, genBtn]),
  ]));

  // ---- Claves generadas ----
  const tabla = codigos.length ? dataTable({
    columns: [
      { key: 'codigo', label: 'Clave' },
      { key: 'dias', label: 'Días', className: 'text-center' },
      { key: 'estado', label: 'Estado', render: (r) => r.usado ? badge('Usada', 'secondary') : badge('Vigente', 'success') },
      { key: 'usadoFecha', label: 'Usada el', render: (r) => (r.usado && r.usadoFecha) ? fmt.dateTime(r.usadoFecha) : '-' },
      { key: 'fechaGeneracion', label: 'Generada', render: (r) => fmt.dateTime(r.fechaGeneracion) },
    ],
    rows: codigos,
    searchKeys: ['codigo'],
    actions: [
      { icon: 'bi-clipboard', title: 'Copiar', className: 'btn-outline-secondary', onClick: (r) => copiar(r.codigo), show: (r) => !r.usado },
      { icon: 'bi-trash', title: 'Dar de baja', className: 'btn-outline-danger', onClick: (r) => bajaCodigo(r, panel, empresaId), show: (r) => !r.usado },
    ],
  }) : h('div', { class: 'sk-card p-4 text-center text-muted' }, 'Todavía no generaste claves para esta empresa.');
  panel.append(h('h6', { class: 'mb-2' }, 'Claves generadas'), tabla);
}

async function mostrarClave(codigo, dias) {
  const Swal = window.Swal;
  await Swal.fire({
    icon: 'success',
    title: 'Clave generada',
    html: `<p class="mb-2">Pasale esta clave al administrador de la empresa (suma <b>${dias} días</b>):</p>`
      + `<div class="fs-4 fw-bold user-select-all">${codigo}</div>`,
    confirmButtonText: 'Copiar y cerrar', confirmButtonColor: '#2563eb',
  });
  copiar(codigo);
}

async function copiar(codigo) {
  try { await navigator.clipboard.writeText(codigo); ui.toast('Clave copiada.'); }
  catch { ui.info('Clave', codigo); }
}

async function bajaCodigo(r, panel, empresaId) {
  const ok = await ui.confirm(`¿Dar de baja la clave ${r.codigo}? No se podrá usar.`, { confirmText: 'Dar de baja' });
  if (!ok) return;
  ui.loading('Dando de baja...');
  try { await api.del(`/suscripcion/codigos/${r.id}`); ui.close(); renderEmpresa(panel, empresaId); }
  catch (err) { ui.close(); ui.error(err.message); }
}
