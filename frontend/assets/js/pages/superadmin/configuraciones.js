// Configuraciones (superadmin): habilita/deshabilita los paquetes por sucursal.
// Se elige empresa -> sucursal y se guardan los flags con PUT /sucursales/:id.
// Pensado para crecer: aca iran apareciendo mas ajustes por sucursal.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner } from '../../components/page.js';

// Presets de paquete -> flags.
const PAQUETES = {
  COMPLETO: { usaStock: true, usaFacturacion: true, usaEnvioCorreos: false },
  SOLO_FACTURACION: { usaStock: false, usaFacturacion: true, usaEnvioCorreos: false },
  SOLO_STOCK: { usaStock: true, usaFacturacion: false, usaEnvioCorreos: false },
  SOLO_CORREOS: { usaStock: false, usaFacturacion: false, usaEnvioCorreos: true },
};

function paqueteDe(suc) {
  if (suc.usaEnvioCorreos && !suc.usaStock && !suc.usaFacturacion) return 'SOLO_CORREOS';
  if (suc.usaStock && suc.usaFacturacion) return 'COMPLETO';
  if (!suc.usaStock && suc.usaFacturacion) return 'SOLO_FACTURACION';
  return 'SOLO_STOCK';
}

export async function configuraciones() {
  const content = renderShell('Configuraciones');
  content.append(pageHeader('Configuraciones', 'Habilitá los paquetes y opciones de cada sucursal.'));

  const empresaSel = h('select', { class: 'form-select' }, [h('option', { value: '' }, 'Seleccionar empresa...')]);
  const sucursalSel = h('select', { class: 'form-select', disabled: true }, [h('option', { value: '' }, 'Seleccionar sucursal...')]);
  const panel = h('div');

  content.append(h('div', { class: 'sk-card p-3 mb-3' }, [
    h('div', { class: 'row g-3' }, [
      h('div', { class: 'col-md-6' }, [h('label', { class: 'form-label small mb-1' }, 'Empresa'), empresaSel]),
      h('div', { class: 'col-md-6' }, [h('label', { class: 'form-label small mb-1' }, 'Sucursal'), sucursalSel]),
    ]),
  ]));
  content.append(panel);

  let sucursalesDeEmpresa = [];

  try {
    const empresas = await api.get('/empresas');
    for (const e of empresas) empresaSel.append(h('option', { value: e.id }, e.nombre));
  } catch (err) {
    content.append(h('div', { class: 'alert alert-danger' }, `No se pudieron cargar las empresas: ${err.message}`));
    return;
  }

  empresaSel.addEventListener('change', async () => {
    clear(panel);
    sucursalSel.innerHTML = '';
    sucursalSel.append(h('option', { value: '' }, 'Seleccionar sucursal...'));
    sucursalSel.disabled = true;
    if (!empresaSel.value) return;
    const loading = spinner('Cargando sucursales...');
    panel.append(loading);
    try {
      sucursalesDeEmpresa = await api.get(`/sucursales/empresa/${empresaSel.value}`);
      loading.remove();
      for (const s of sucursalesDeEmpresa) sucursalSel.append(h('option', { value: s.id }, s.nombre));
      sucursalSel.disabled = sucursalesDeEmpresa.length === 0;
      if (sucursalesDeEmpresa.length === 0) panel.append(h('div', { class: 'text-muted' }, 'Esta empresa no tiene sucursales activas.'));
    } catch (err) {
      loading.remove();
      panel.append(h('div', { class: 'alert alert-danger' }, `Error: ${err.message}`));
    }
  });

  sucursalSel.addEventListener('change', () => {
    clear(panel);
    if (!sucursalSel.value) return;
    const suc = sucursalesDeEmpresa.find((s) => String(s.id) === String(sucursalSel.value));
    if (suc) panel.append(formularioSucursal(suc));
  });
}

function formularioSucursal(suc) {
  let paquete = paqueteDe(suc);
  let usaLotes = suc.usaLotes !== false;

  const lotesCheck = h('input', { class: 'form-check-input', type: 'checkbox', id: 'cfg-lotes', checked: usaLotes });
  const lotesWrap = h('div', { class: 'form-check' }, [
    lotesCheck, h('label', { class: 'form-check-label', for: 'cfg-lotes' }, 'Usar lotes (vencimientos)'),
  ]);

  // ---- Consulta de precios (kiosko), depende del paquete de facturacion ----
  const consultaCheck = h('input', { class: 'form-check-input', type: 'checkbox', id: 'cfg-consulta', checked: suc.usaConsultaPrecio === true });
  const consultaWrap = h('div', { class: 'form-check' }, [
    consultaCheck, h('label', { class: 'form-check-label', for: 'cfg-consulta' }, 'Habilitar consulta de precios (kiosko para clientes)'),
  ]);
  const urlKiosko = `${window.location.origin}/consulta.html?sucursal=${suc.id}`;
  const urlInput = h('input', { class: 'form-control', type: 'text', readonly: true, value: urlKiosko });
  const copiarBtn = h('button', { class: 'btn btn-outline-secondary', type: 'button' }, [h('i', { class: 'bi bi-clipboard' })]);
  copiarBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(urlKiosko); ui.toast('Enlace copiado.'); } catch { urlInput.select(); }
  });
  const urlBox = h('div', { class: 'mt-2' }, [
    h('label', { class: 'form-label small mb-1' }, 'Enlace del kiosko (abrilo en el dispositivo del local):'),
    h('div', { class: 'input-group' }, [
      urlInput, copiarBtn,
      h('a', { class: 'btn btn-outline-primary', href: urlKiosko, target: '_blank', rel: 'noopener' }, [h('i', { class: 'bi bi-box-arrow-up-right' })]),
    ]),
  ]);

  // Los lotes dependen del control de stock; la consulta de precios, de la facturacion.
  function refrescar() {
    const stockOn = PAQUETES[paquete].usaStock;
    lotesCheck.disabled = !stockOn;
    if (!stockOn) lotesCheck.checked = false;

    const facturacionOn = PAQUETES[paquete].usaFacturacion;
    consultaCheck.disabled = !facturacionOn;
    if (!facturacionOn) consultaCheck.checked = false;
    urlBox.classList.toggle('d-none', !consultaCheck.checked);
  }
  consultaCheck.addEventListener('change', () => urlBox.classList.toggle('d-none', !consultaCheck.checked));

  const radios = Object.entries({
    COMPLETO: 'Completo (facturación + control de stock)',
    SOLO_FACTURACION: 'Solo facturación',
    SOLO_STOCK: 'Solo control de stock',
    SOLO_CORREOS: 'Solo envío de correos (automatizar quincenas por Excel)',
  }).map(([value, label]) => {
    const input = h('input', {
      class: 'form-check-input', type: 'radio', name: 'cfg-paquete', id: `pq-${value}`,
      value, checked: paquete === value,
    });
    input.addEventListener('change', () => { if (input.checked) { paquete = value; refrescar(); } });
    return h('div', { class: 'form-check' }, [input, h('label', { class: 'form-check-label', for: `pq-${value}` }, label)]);
  });

  const guardar = h('button', { class: 'btn btn-primary' }, [h('i', { class: 'bi bi-save me-1' }), 'Guardar cambios']);
  guardar.addEventListener('click', async () => {
    const flags = PAQUETES[paquete];
    const usaConsultaPrecio = flags.usaFacturacion ? consultaCheck.checked : false;
    ui.loading('Guardando...');
    try {
      await api.put(`/sucursales/${suc.id}`, {
        usaStock: flags.usaStock,
        usaFacturacion: flags.usaFacturacion,
        usaEnvioCorreos: !!flags.usaEnvioCorreos,
        usaLotes: flags.usaStock ? lotesCheck.checked : false,
        usaConsultaPrecio,
      });
      // Refleja el cambio localmente para no perderlo si se vuelve a guardar.
      Object.assign(suc, flags, { usaLotes: flags.usaStock ? lotesCheck.checked : false, usaConsultaPrecio });
      ui.close();
      ui.success('Configuración guardada.');
    } catch (err) { ui.close(); ui.error(err.message); }
  });

  refrescar();

  return h('div', { class: 'sk-card p-4' }, [
    h('h5', { class: 'mb-1' }, suc.nombre),
    h('p', { class: 'text-muted small' }, 'Paquete contratado por la sucursal.'),
    h('div', { class: 'mb-3' }, radios),
    h('hr'),
    h('h6', { class: 'mb-2' }, 'Opciones de control de stock'),
    lotesWrap,
    h('hr'),
    h('h6', { class: 'mb-2' }, 'Facturación'),
    consultaWrap,
    urlBox,
    h('div', { class: 'mt-4' }, [guardar]),
  ]);
}
