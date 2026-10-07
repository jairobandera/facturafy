// Dashboard del cajero. Lo primero es el turno de caja: hasta estar dentro de un
// turno abierto, el punto de venta y los clientes quedan bloqueados. Un turno es
// UNO por sucursal; si ya hay uno abierto, el cajero se suma a ese.
import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { ui, fmt } from '../../core/ui.js';
import { renderShell } from '../../core/layout.js';
import { pageHeader, spinner, primaryButton, badge } from '../../components/page.js';
import { quickCard } from '../../components/cards.js';
import { formModal } from '../../components/formModal.js';
import { auth } from '../../core/auth.js';
import { sucursalActiva } from '../../core/sucursal.js';
import { cargarTurnoActivo, soyMiembro, soyResponsable } from '../../core/turno.js';
import { resolveUsuarioId } from '../shared/session.js';

const NUMEROS = [
  { value: 1, label: '1 - Mañana' },
  { value: 2, label: '2 - Tarde' },
  { value: 3, label: '3 - Noche' },
  { value: 4, label: '4 - Otro' },
];

export async function cajeroDashboard() {
  const content = renderShell('Facturación');
  const sucursalId = sucursalActiva();
  const nombre = auth.getUsername();
  content.append(pageHeader(`Hola, ${nombre}`, 'Punto de venta y clientes de tu sucursal.'));

  const wrap = h('div');
  content.append(wrap);

  let usuarioId = null;
  let turno = null;

  async function recargar() {
    clear(wrap);
    const loading = spinner('Cargando turno...');
    wrap.append(loading);
    try {
      [usuarioId, turno] = await Promise.all([resolveUsuarioId(), cargarTurnoActivo(sucursalId)]);
    } catch (err) {
      loading.remove();
      wrap.append(h('div', { class: 'alert alert-danger' }, `No se pudo cargar el turno: ${err.message}`));
      return;
    }
    loading.remove();
    render();
  }

  function render() {
    clear(wrap);
    if (!turno) { wrap.append(cardIniciar()); return; }
    if (!soyMiembro(turno, usuarioId)) { wrap.append(cardUnirse()); return; }
    wrap.append(panelTurno(), accesos());
  }

  // -------- Sin turno abierto --------
  function cardIniciar() {
    const btn = primaryButton('Iniciar turno', 'bi-play-circle', iniciarTurno);
    return h('div', { class: 'sk-card p-4 text-center' }, [
      h('i', { class: 'bi bi-clock-history', style: { fontSize: '2.5rem', color: '#2563eb' } }),
      h('h5', { class: 'mt-3 mb-1' }, 'No hay un turno abierto'),
      h('p', { class: 'text-muted' }, 'Iniciá el turno de caja para poder facturar y registrar clientes.'),
      h('div', { class: 'd-flex justify-content-center' }, btn),
    ]);
  }

  async function iniciarTurno() {
    const values = await formModal({
      title: 'Iniciar turno',
      submitText: 'Iniciar turno',
      fields: [
        { name: 'numero', label: '¿Qué turno es?', type: 'radiogroup', options: NUMEROS, value: 1 },
        { name: 'esResponsable', label: 'Soy el cajero responsable del turno', type: 'checkbox', value: true,
          help: 'El responsable es quien responde por la caja del turno. Si no lo marcás, podés facturar igual, pero el turno quedará sin responsable hasta que alguien lo tome.' },
      ],
    });
    if (!values) return;
    ui.loading('Abriendo turno...');
    try {
      await api.post('/turnos', {
        sucursalId, numero: Number(values.numero), usuarioId, esResponsable: !!values.esResponsable,
      });
      ui.close();
      ui.success('Turno iniciado.');
      await recargar();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  // -------- Turno abierto por otros: unirse --------
  function cardUnirse() {
    const resp = turno.usuarioResponsableId ? nombreParticipante(turno.usuarioResponsableId) : 'Sin responsable';
    return h('div', { class: 'sk-card p-4 text-center' }, [
      h('i', { class: 'bi bi-people', style: { fontSize: '2.5rem', color: '#2563eb' } }),
      h('h5', { class: 'mt-3 mb-1' }, `Hay un turno abierto (${turno.numeroLabel})`),
      h('p', { class: 'text-muted mb-1' }, `Abierto ${fmt.dateTime(turno.fechaApertura)}.`),
      h('p', { class: 'text-muted' }, [h('b', {}, 'Responsable: '), resp]),
      h('div', { class: 'd-flex justify-content-center' }, primaryButton('Unirme al turno', 'bi-box-arrow-in-right', unirse)),
    ]);
  }

  async function unirse() {
    // Solo se ofrece ser responsable si el turno todavía no tiene uno.
    const puedeSerResponsable = turno.usuarioResponsableId == null;
    let esResponsable = false;
    if (puedeSerResponsable) {
      const values = await formModal({
        title: 'Unirme al turno',
        submitText: 'Unirme',
        fields: [
          { name: 'esResponsable', label: 'Tomar como cajero responsable del turno', type: 'checkbox', value: false,
            help: 'Este turno todavía no tiene responsable. Si lo tomás, quedás como responsable de la caja.' },
        ],
      });
      if (!values) return;
      esResponsable = !!values.esResponsable;
    } else {
      const ok = await ui.confirm('Te vas a sumar al turno abierto para poder facturar.',
        { title: 'Unirme al turno', confirmText: 'Unirme', danger: false });
      if (!ok) return;
    }
    ui.loading('Uniéndote al turno...');
    try {
      await api.post(`/turnos/${turno.id}/unirse`, { usuarioId, esResponsable });
      ui.close();
      ui.success('Te uniste al turno.');
      await recargar();
    } catch (err) { ui.close(); ui.error(err.message); }
  }

  // -------- Turno abierto y soy miembro --------
  function panelTurno() {
    const responsable = turno.usuarioResponsableId ? nombreParticipante(turno.usuarioResponsableId) : 'Sin responsable';
    const participantes = (turno.participantes || []).map((p) =>
      h('span', { class: 'badge text-bg-light border me-1 mb-1' }, [
        `${p.nombre || ''} ${p.apellido || ''}`.trim() || p.nombreUsuario,
        p.esResponsable ? h('i', { class: 'bi bi-star-fill text-warning ms-1', title: 'Responsable' }) : null,
      ]));
    return h('div', { class: 'sk-card p-3 mb-3' }, [
      h('div', { class: 'd-flex flex-wrap align-items-center justify-content-between gap-2 mb-2' }, [
        h('div', { class: 'd-flex align-items-center gap-2' }, [
          h('i', { class: 'bi bi-clock-history text-primary', style: { fontSize: '1.4rem' } }),
          h('div', {}, [
            h('div', { class: 'fw-semibold' }, [`Turno ${turno.numeroLabel} `, badge('Abierto', 'success')]),
            h('div', { class: 'text-muted small' }, `Desde ${fmt.dateTime(turno.fechaApertura)}`),
          ]),
        ]),
        h('div', { class: 'text-end small' }, [h('div', { class: 'text-muted' }, 'Responsable'), h('div', { class: 'fw-semibold' }, responsable)]),
      ]),
      h('div', {}, participantes),
    ]);
  }

  function accesos() {
    return h('div', { class: 'row g-3' }, [
      col(quickCard('Punto de venta', 'bi-cart-plus', '#/facturacion/pos')),
      col(quickCard('Clientes', 'bi-person-vcard', '#/facturacion/clientes')),
      col(quickCard('Ventas del turno', 'bi-receipt', '#/facturacion/ventas-turno')),
      col(quickCard('Cerrar turno', 'bi-door-closed', '#/facturacion/cerrar-turno',
        soyResponsable(turno, usuarioId) ? {} : { disabled: true, title: 'Solo el cajero responsable o un administrador pueden cerrar el turno.' })),
    ]);
  }

  function nombreParticipante(uid) {
    const p = (turno.participantes || []).find((x) => Number(x.usuarioId) === Number(uid));
    if (!p) return `Usuario #${uid}`;
    return `${p.nombre || ''} ${p.apellido || ''}`.trim() || p.nombreUsuario;
  }

  await recargar();
}

const col = (child) => h('div', { class: 'col-12 col-sm-6 col-lg-3' }, child);
