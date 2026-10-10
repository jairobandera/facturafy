// Asistente de mapeo de columnas para importar Excels SIN encabezado (o con columnas
// distintas a las que reconoce la app). Muestra una vista previa, deja elegir qué
// columna es cada campo, desde qué fila empiezan los datos, un filtro de filas opcional
// (ej. Tipo = Cliente) y campos compuestos (ej. Nombre = col A + col B). Puede guardar
// y reusar "perfiles" por empresa+tipo.
//
// Devuelve una promesa con { mapeo, filaInicio, filtro } o null si se cancela.
//   mapeo: { campo: colIndex }  (o { campo: [idxA, idxB] } para campos compuestos)
//   filaInicio: índice 0-based de la primera fila de datos
//   filtro: { col: idx, valor: string } | null
import { h, clear } from '../core/dom.js';
import { api } from '../core/api.js';
import { ui } from '../core/ui.js';

const Swal = window.Swal;

export function mapeoColumnas({ matriz, campos, empresaId, tipo, conFiltro = false }) {
  return new Promise((resolve) => {
    const preview = (matriz || []).slice(0, 12);
    const nCols = Math.max(1, ...preview.map((r) => (r ? r.length : 0)));
    const primerValor = (c) => {
      for (const r of preview) { const v = r && r[c]; if (v != null && String(v).trim() !== '') return String(v).trim(); }
      return '';
    };
    const opcionesCol = (incluirNinguna = true) => [
      ...(incluirNinguna ? [h('option', { value: '' }, '— ninguna —')] : []),
      ...Array.from({ length: nCols }, (_, c) => h('option', { value: String(c) }, `Col ${c + 1}${primerValor(c) ? `: ${primerValor(c).slice(0, 24)}` : ''}`)),
    ];

    // --- selects por campo ---
    const selects = {};      // campo -> <select> principal
    const selectsExtra = {}; // campo -> <select> secundario (compuesto)
    const camposRows = campos.map((f) => {
      const sel = h('select', { class: 'form-select' }, opcionesCol());
      selects[f.campo] = sel;
      const cols = [h('div', { class: 'col-4 fw-semibold' }, [f.label, f.requerido ? h('span', { class: 'text-danger' }, ' *') : null]),
        h('div', { class: 'col' }, sel)];
      if (f.compuesto) {
        // Hasta 2 columnas extra: para filas heterogeneas (ej. razon social O nombre+apellido),
        // se toma la primera no vacia / se concatenan las presentes.
        const sel2 = h('select', { class: 'form-select' }, opcionesCol());
        const sel3 = h('select', { class: 'form-select' }, opcionesCol());
        selectsExtra[f.campo] = [sel2, sel3];
        cols.push(h('div', { class: 'col' }, [h('div', { class: 'small text-muted' }, '+ otra col.'), sel2]));
        cols.push(h('div', { class: 'col' }, [h('div', { class: 'small text-muted' }, '+ otra col.'), sel3]));
      }
      return h('div', { class: 'row g-2 align-items-center mb-2' }, cols);
    });

    // --- fila de inicio ---
    const filaInicioInput = h('input', { class: 'form-control w-auto', type: 'number', min: 0, value: 0 });

    // --- filtro opcional ---
    let filtroColSel, filtroValInput;
    let filtroRow = null;
    if (conFiltro) {
      filtroColSel = h('select', { class: 'form-select' }, opcionesCol());
      filtroValInput = h('input', { class: 'form-control', type: 'text', placeholder: 'Valor (ej. Cliente)' });
      filtroRow = h('div', { class: 'row g-2 align-items-center mb-2' }, [
        h('div', { class: 'col-5 fw-semibold' }, 'Filtrar filas (opcional)'),
        h('div', { class: 'col' }, filtroColSel),
        h('div', { class: 'col' }, [h('div', { class: 'small text-muted' }, 'donde la columna ='), filtroValInput]),
      ]);
    }

    // --- perfiles ---
    const perfilSel = h('select', { class: 'form-select w-auto' }, [h('option', { value: '' }, '— elegir perfil guardado —')]);
    let perfiles = [];
    const aplicarPerfil = (p) => {
      if (!p) return;
      const m = p.mapeo || {};
      for (const f of campos) {
        const v = (m.mapeo || {})[f.campo];
        if (Array.isArray(v)) {
          selects[f.campo].value = v[0] != null ? String(v[0]) : '';
          if (selectsExtra[f.campo]) {
            selectsExtra[f.campo][0].value = v[1] != null ? String(v[1]) : '';
            selectsExtra[f.campo][1].value = v[2] != null ? String(v[2]) : '';
          }
        } else selects[f.campo].value = v != null ? String(v) : '';
      }
      if (m.filaInicio != null) filaInicioInput.value = String(m.filaInicio);
      if (conFiltro && m.filtro) { filtroColSel.value = m.filtro.col != null ? String(m.filtro.col) : ''; filtroValInput.value = m.filtro.valor || ''; }
    };
    perfilSel.addEventListener('change', () => aplicarPerfil(perfiles.find((p) => String(p.id) === perfilSel.value)));

    (async () => {
      if (!empresaId) return;
      try {
        perfiles = await api.get(`/import-perfiles/empresa/${empresaId}?tipo=${encodeURIComponent(tipo || '')}`);
        for (const p of perfiles) perfilSel.append(h('option', { value: String(p.id) }, p.nombre));
      } catch { /* sin perfiles */ }
    })();

    function leerMapeo() {
      const mapeo = {};
      for (const f of campos) {
        const v = selects[f.campo].value;
        if (f.compuesto && selectsExtra[f.campo]) {
          const arr = [v, ...selectsExtra[f.campo].map((s) => s.value)]
            .map((x) => (x === '' ? null : Number(x))).filter((x) => x != null);
          if (arr.length) mapeo[f.campo] = arr;
        } else if (v !== '') mapeo[f.campo] = Number(v);
      }
      const filaInicio = Math.max(0, Number(filaInicioInput.value) || 0);
      const filtro = (conFiltro && filtroColSel.value !== '' && filtroValInput.value.trim())
        ? { col: Number(filtroColSel.value), valor: filtroValInput.value.trim() } : null;
      return { mapeo, filaInicio, filtro };
    }

    const guardarPerfilBtn = h('button', { class: 'btn btn-outline-secondary btn-sm', type: 'button' }, [h('i', { class: 'bi bi-save me-1' }), 'Guardar perfil']);
    guardarPerfilBtn.addEventListener('click', async () => {
      if (!empresaId) { ui.error('No se pudo determinar la empresa.'); return; }
      const { value: nombre } = await Swal.fire({ title: 'Nombre del perfil', input: 'text', inputPlaceholder: 'Ej: Export sistema viejo', showCancelButton: true, confirmButtonColor: '#2563eb' });
      if (!nombre) return;
      try {
        await api.post('/import-perfiles', { empresaId, tipo, nombre: nombre.trim(), mapeo: leerMapeo() });
        ui.toast('Perfil guardado.');
        perfiles = await api.get(`/import-perfiles/empresa/${empresaId}?tipo=${encodeURIComponent(tipo || '')}`);
        clear(perfilSel); perfilSel.append(h('option', { value: '' }, '— elegir perfil guardado —'));
        for (const p of perfiles) perfilSel.append(h('option', { value: String(p.id) }, p.nombre));
      } catch (err) { ui.error(err.message); }
    });

    // --- tabla de vista previa ---
    const thead = h('tr', {}, [h('th', { class: 'small text-muted' }, 'fila'),
      ...Array.from({ length: nCols }, (_, c) => h('th', { class: 'small' }, `Col ${c + 1}`))]);
    const tbody = h('tbody', {}, preview.map((r, i) => h('tr', {}, [
      h('td', { class: 'small text-muted' }, String(i)),
      ...Array.from({ length: nCols }, (_, c) => h('td', { class: 'small text-nowrap', style: { maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' } }, String((r && r[c] != null) ? r[c] : ''))),
    ])));
    const previewTable = h('div', { class: 'table-responsive border rounded mb-3', style: { maxHeight: '240px' } }, [
      h('table', { class: 'table table-sm table-bordered mb-0' }, [h('thead', {}, thead), tbody]),
    ]);

    const errorBox = h('div', { class: 'alert alert-danger d-none py-2' });

    const modalEl = h('div', { class: 'modal fade', tabindex: '-1' }, [
      h('div', { class: 'modal-dialog modal-dialog-centered modal-xl' }, [
        h('div', { class: 'modal-content' }, [
          h('div', { class: 'modal-header' }, [
            h('h5', { class: 'modal-title' }, 'Mapear columnas del Excel'),
            h('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal' }),
          ]),
          h('div', { class: 'modal-body' }, [
            h('p', { class: 'text-muted small' }, 'Tu archivo no tiene encabezado reconocible. Indicá qué columna es cada campo y desde qué fila empiezan los datos. Podés guardar un perfil para reusarlo.'),
            h('div', { class: 'd-flex flex-wrap gap-2 align-items-center mb-3' }, [
              h('span', { class: 'small text-muted' }, 'Perfil:'), perfilSel, guardarPerfilBtn,
            ]),
            previewTable,
            h('div', { class: 'row g-2 align-items-center mb-3' }, [
              h('div', { class: 'col-5 fw-semibold' }, 'Primera fila de datos'),
              h('div', { class: 'col' }, [filaInicioInput]),
            ]),
            errorBox,
            ...camposRows,
            filtroRow,
          ]),
          h('div', { class: 'modal-footer' }, [
            h('button', { type: 'button', class: 'btn btn-secondary', 'data-bs-dismiss': 'modal' }, 'Cancelar'),
            h('button', { type: 'button', class: 'btn btn-primary', id: 'mc-aceptar' }, 'Usar este mapeo'),
          ]),
        ]),
      ]),
    ]);

    document.body.append(modalEl);
    const modal = new bootstrap.Modal(modalEl);
    let aceptado = false;

    modalEl.querySelector('#mc-aceptar').addEventListener('click', () => {
      const res = leerMapeo();
      const faltan = campos.filter((f) => f.requerido && res.mapeo[f.campo] === undefined);
      if (faltan.length) { errorBox.textContent = `Asigná una columna para: ${faltan.map((f) => f.label).join(', ')}.`; errorBox.classList.remove('d-none'); return; }
      aceptado = true; modal.hide(); resolve(res);
    });
    modalEl.addEventListener('hidden.bs.modal', () => {
      try { modal.dispose(); } catch { /* ignore */ }
      modalEl.remove();
      if (!document.querySelector('.modal.show')) {
        document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
      }
      if (!aceptado) resolve(null);
    });
    modal.show();
  });
}

/**
 * Aplica un mapeo a la matriz y devuelve filas de objetos { campo: valor }.
 * - compuesto (array de columnas): concatena los valores con espacio.
 * - filtro: deja solo las filas donde la columna == valor (sin distinción de may/min).
 */
export function aplicarMapeo(matriz, { mapeo, filaInicio = 0, filtro = null }) {
  const out = [];
  for (let i = filaInicio; i < matriz.length; i++) {
    const row = matriz[i] || [];
    if (filtro && String(row[filtro.col] ?? '').trim().toLowerCase() !== filtro.valor.toLowerCase()) continue;
    const obj = {};
    let algo = false;
    for (const [campo, col] of Object.entries(mapeo)) {
      if (Array.isArray(col)) {
        const partes = col.map((c) => String(row[c] ?? '').trim()).filter(Boolean);
        obj[campo] = partes.join(' ');
      } else {
        obj[campo] = row[col] != null ? row[col] : null;
      }
      if (obj[campo] != null && String(obj[campo]).trim() !== '') algo = true;
    }
    if (algo) out.push(obj);
  }
  return out;
}
